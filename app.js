
const CATEGORY_LABELS = {
  breakfast: "Сніданки",
  lunch: "Обіди",
  dinner: "Вечері",
  salad: "Салати"
};

const CATEGORY_EMOJI = {
  breakfast: "☀",
  lunch: "◒",
  dinner: "☾",
  salad: "✿"
};

const CATEGORY_CLASS = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  salad: "salad"
};

const MEAL_SLOTS = [
  { key: "breakfast", label: "Сніданок" },
  { key: "lunch", label: "Обід" },
  { key: "dinner", label: "Вечеря" }
];

let dishes = [];
let activeCategory = "all";
let searchTerm = "";
let currentWeekOffset = 0;
let toastTimer = null;

const $ = (selector) => document.querySelector(selector);

const dishGrid = $("#dishGrid");
const emptyState = $("#emptyState");
const recipeDialog = $("#recipeDialog");
const helpDialog = $("#helpDialog");

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getDish(id) {
  return dishes.find(dish => String(dish.id) === String(id));
}

/* Завантаження страв із dishes.json */

async function loadDishes() {
  try {
    const response = await fetch("dishes.json", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Файл dishes.json не знайдено");
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("У dishes.json має бути масив страв");
    }

    dishes = data.filter(dish =>
      dish &&
      dish.id != null &&
      dish.name &&
      CATEGORY_LABELS[dish.category]
    );
  } catch (error) {
    dishes = [];

    console.info(
      "Меню поки порожнє. Додай dishes.json поруч із index.html.",
      error.message
    );
  }

  renderDishes();
  renderPlanner();
  updatePlanCount();
}

/* Пошук, фільтрація та сортування */

function getFilteredDishes() {
  const filtered = dishes.filter(dish => {
    const categoryMatch =
      activeCategory === "all" ||
      dish.category === activeCategory;

    const haystack = [
      dish.name,
      dish.description,
      ...safeArray(dish.tags),
      ...safeArray(dish.ingredients)
    ].join(" ").toLocaleLowerCase("uk");

    return categoryMatch &&
      haystack.includes(searchTerm.toLocaleLowerCase("uk"));
  });

  if ($("#sortSelect").value === "time") {
    filtered.sort((a, b) =>
      (Number(a.time) || 999) - (Number(b.time) || 999)
    );
  } else {
    filtered.sort((a, b) =>
      a.name.localeCompare(b.name, "uk")
    );
  }

  return filtered;
}

/* Відображення карток */

function renderDishes() {
  const counts = Object.fromEntries(
    Object.keys(CATEGORY_LABELS).map(category => [
      category,
      dishes.filter(dish => dish.category === category).length
    ])
  );

  $("[data-category='all'] span").textContent = dishes.length;

  Object.entries(counts).forEach(([category, count]) => {
    const node = document.querySelector(
      `[data-count="${category}"]`
    );

    if (node) {
      node.textContent = count;
    }
  });

  const filtered = getFilteredDishes();

  $("#resultsLabel").textContent = filtered.length
    ? `Знайдено страв: ${filtered.length}`
    : dishes.length
      ? "За цим запитом нічого не знайдено"
      : "Поки тут вільне місце для твоїх рецептів";

  dishGrid.innerHTML = filtered.map(dish => {
    const category = CATEGORY_CLASS[dish.category];

    const tags = safeArray(dish.tags)
      .slice(0, 3)
      .map(tag => `<span>${escapeHTML(tag)}</span>`)
      .join("");

    return `
      <article class="dish-card">
        <div class="dish-visual ${category}">
          <span class="dish-category">
            ${CATEGORY_EMOJI[dish.category]}
            ${CATEGORY_LABELS[dish.category]}
          </span>

          <span class="dish-time">
            ◷ ${Number(dish.time) || "—"} хв
          </span>

          <span class="dish-emoji" aria-hidden="true">
            ${escapeHTML(dish.emoji || "🍽️")}
          </span>
        </div>

        <div class="dish-content">
          <h3>${escapeHTML(dish.name)}</h3>

          <p>
            ${escapeHTML(
              dish.description ||
              "Домашня страва для твоєї колекції рецептів."
            )}
          </p>

          <div class="dish-tags">
            ${tags || "<span>Домашнє</span>"}
          </div>

          <div class="card-actions">
            <button
              class="recipe-btn"
              data-recipe="${escapeHTML(dish.id)}">
              Рецепт
            </button>

            <button
              class="add-btn"
              data-add="${escapeHTML(dish.id)}">
              ＋ До плану
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  emptyState.classList.toggle(
    "visible",
    filtered.length === 0
  );

  dishGrid.style.display = filtered.length ? "grid" : "none";
}

/* Робота з планом харчування */

function getPlan() {
  try {
    return JSON.parse(
      localStorage.getItem("warmMenuPlan") || "{}"
    );
  } catch {
    return {};
  }
}

function savePlan(plan) {
  localStorage.setItem(
    "warmMenuPlan",
    JSON.stringify(plan)
  );

  updatePlanCount();
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfWeek(offset = 0) {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;

  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - day + offset * 7
  );

  monday.setHours(12, 0, 0, 0);

  return monday;
}

function formatDate(
  date,
  options = { day: "numeric", month: "short" }
) {
  return new Intl.DateTimeFormat(
    "uk-UA",
    options
  ).format(date);
}

/* Відображення календаря */

function renderPlanner() {
  const monday = startOfWeek(currentWeekOffset);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  $("#weekLabel").textContent =
    currentWeekOffset === 0
      ? "Цей тиждень"
      : currentWeekOffset > 0
        ? `Тиждень +${currentWeekOffset}`
        : `Тиждень ${currentWeekOffset}`;

  $("#weekDates").textContent =
    `${formatDate(monday)} — ${formatDate(sunday)}`;

  const plan = getPlan();
  const todayKey = dateKey(new Date());

  const days = [
    "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"
  ];

  $("#weekGrid").innerHTML = days.map((dayName, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);

    const key = dateKey(date);

    const slots = MEAL_SLOTS.map(slot => {
      const planned = plan[key]?.[slot.key];
      const dish = planned ? getDish(planned) : null;

      if (dish) {
        return `
          <div class="meal-slot ${slot.key}">
            <span class="slot-label">${slot.label}</span>

            <div class="planned-dish">
              ${escapeHTML(dish.emoji || "🍽️")}
              ${escapeHTML(dish.name)}
            </div>

            <button
              class="remove-planned"
              data-remove="${key}"
              data-slot="${slot.key}"
              aria-label="Прибрати страву">
              ×
            </button>

            <button
              class="slot-add"
              data-pick="${key}"
              data-slot="${slot.key}"
              aria-label="Замінити страву">
              ↻
            </button>
          </div>
        `;
      }

      return `
        <div class="meal-slot ${slot.key}">
          <span class="slot-label">${slot.label}</span>
          <span class="slot-empty">Поки порожньо</span>

          <button
            class="slot-add"
            data-pick="${key}"
            data-slot="${slot.key}"
            aria-label="Додати страву">
            ＋
          </button>
        </div>
      `;
    }).join("");

    return `
      <section class="day-column">
        <header class="day-head ${key === todayKey ? "today" : ""}">
          <strong>${dayName}</strong>
          <span>
            ${formatDate(date, {
              day: "numeric",
              month: "short"
            })}
          </span>
        </header>

        <div class="day-meals">
          ${slots}
        </div>
      </section>
    `;
  }).join("");
}

/* Лічильник запланованих страв */

function updatePlanCount() {
  const plan = getPlan();
  let count = 0;

  Object.values(plan).forEach(day => {
    Object.values(day || {}).forEach(id => {
      if (id != null) count++;
    });
  });

  $("#planCount").textContent = count;
}

/* Додавання страви до певного дня та прийому їжі */

function addDishToPlan(dishId, date, slot) {
  const dish = getDish(dishId);

  if (!dish) return;

  const chosenSlot = slot ||
    (
      ["breakfast", "lunch", "dinner"].includes(dish.category)
        ? dish.category
        : "lunch"
    );

  const plan = getPlan();

  plan[date] ||= {};
  plan[date][chosenSlot] = dish.id;

  savePlan(plan);
  renderPlanner();

  showToast(`«${dish.name}» додано до плану`);
}

/* Вікно рецепта */

function openRecipe(dishId) {
  const dish = getDish(dishId);

  if (!dish) return;

  const category = CATEGORY_CLASS[dish.category];
  const ingredients = safeArray(dish.ingredients);
  const steps = safeArray(dish.steps);

  $("#recipeContent").innerHTML = `
    <div class="recipe-inner">
      <div
        class="recipe-hero ${category}"
        style="background:${escapeHTML(dish.color || "#e8ecdf")}">
        ${escapeHTML(dish.emoji || "🍽️")}
      </div>

      <p class="eyebrow">
        ${CATEGORY_LABELS[dish.category]} · РЕЦЕПТ
      </p>

      <h2>${escapeHTML(dish.name)}</h2>

      <p class="recipe-description">
        ${escapeHTML(dish.description || "")}
      </p>

      <div class="recipe-facts">
        <span>◷ ${Number(dish.time) || "—"} хвилин</span>
        <span>♧ ${escapeHTML(dish.difficulty || "Просто")}</span>
        <span>♙ ${Number(dish.servings) || 1} порц.</span>
      </div>

      <h3>Що знадобиться</h3>

      <ul>
        ${
          ingredients.length
            ? ingredients.map(item =>
                `<li>${escapeHTML(item)}</li>`
              ).join("")
            : "<li>Додай інгредієнти до dishes.json</li>"
        }
      </ul>

      <h3>Як приготувати</h3>

      <ol>
        ${
          steps.length
            ? steps.map(step =>
                `<li>${escapeHTML(step)}</li>`
              ).join("")
            : "<li>Додай кроки приготування до dishes.json</li>"
        }
      </ol>

      <button
        class="primary-btn recipe-add"
        data-recipe-add="${escapeHTML(dish.id)}">
        ＋ Додати до плану
      </button>
    </div>
  `;

  recipeDialog.showModal();
}

/* Сповіщення */

function showToast(message) {
  const toast = $("#toast");

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2300);
}

/* Перемикання між каталогом і планувальником */

function switchView(view) {
  const isPlanner = view === "planner";

  $("#menuView").classList.toggle("hidden", isPlanner);
  $("#plannerView").classList.toggle("hidden", !isPlanner);
  $("#hero").classList.toggle("hidden", isPlanner);

  document.querySelectorAll(".nav-link").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === view
    );
  });

  if (isPlanner) {
    renderPlanner();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* Вибір страви для конкретної комірки календаря */

function openPicker(date, slot) {
  switchView("menu");

  const category =
    ["breakfast", "lunch", "dinner"].includes(slot)
      ? slot
      : "all";

  activeCategory = category;

  document.querySelectorAll(".category-tab").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.category === category
    );
  });

  renderDishes();

  showToast(
    `Обери страву на ${formatDate(
      new Date(date + "T12:00:00")
    )}. Натисни «До плану»`
  );

  window.mealPlanTarget = { date, slot };

  $("#searchInput").focus({ preventScroll: true });
}

/* Обробники кнопок */

document.addEventListener("click", event => {
  const categoryButton = event.target.closest("[data-category]");

  if (categoryButton) {
    activeCategory = categoryButton.dataset.category;

    document.querySelectorAll(".category-tab").forEach(button => {
      button.classList.toggle(
        "active",
        button === categoryButton
      );
    });

    renderDishes();
  }

  const recipeButton = event.target.closest("[data-recipe]");

  if (recipeButton) {
    openRecipe(recipeButton.dataset.recipe);
  }

  const addButton = event.target.closest("[data-add]");

  if (addButton) {
    const target = window.mealPlanTarget;
    const dish = getDish(addButton.dataset.add);

    const defaultSlot =
      dish && ["breakfast", "lunch", "dinner"].includes(dish.category)
        ? dish.category
        : "lunch";

    addDishToPlan(
      addButton.dataset.add,
      target?.date || dateKey(startOfWeek(currentWeekOffset)),
      target?.slot || defaultSlot
    );

    window.mealPlanTarget = null;
  }

  const removeButton = event.target.closest("[data-remove]");

  if (removeButton) {
    const plan = getPlan();
    const date = removeButton.dataset.remove;
    const slot = removeButton.dataset.slot;

    if (plan[date]) {
      delete plan[date][slot];

      if (!Object.keys(plan[date]).length) {
        delete plan[date];
      }
    }

    savePlan(plan);
    renderPlanner();
    showToast("Страву прибрано з плану");
  }

  const pickButton = event.target.closest("[data-pick]");

  if (pickButton) {
    openPicker(
      pickButton.dataset.pick,
      pickButton.dataset.slot
    );
  }

  const recipeAdd = event.target.closest("[data-recipe-add]");

  if (recipeAdd) {
    const dish = getDish(recipeAdd.dataset.recipe);
    const target = window.mealPlanTarget;

    const defaultSlot =
      dish && ["breakfast", "lunch", "dinner"].includes(dish.category)
        ? dish.category
        : "lunch";

    addDishToPlan(
      recipeAdd.dataset.recipe,
      target?.date || dateKey(startOfWeek(currentWeekOffset)),
      target?.slot || defaultSlot
    );

    window.mealPlanTarget = null;
    recipeDialog.close();
  }
});

/* Навігація */

document.querySelectorAll(".nav-link").forEach(button => {
  button.addEventListener("click", () => {
    switchView(button.dataset.view);
  });
});

$("#mobilePlanBtn").addEventListener("click", () => {
  switchView("planner");
});

$("#startPlanning").addEventListener("click", () => {
  switchView("planner");
});

/* Пошук і сортування */

$("#searchInput").addEventListener("input", event => {
  searchTerm = event.target.value.trim();
  renderDishes();
});

$("#sortSelect").addEventListener("change", renderDishes);

/* Перемикання тижнів */

$("#prevWeek").addEventListener("click", () => {
  currentWeekOffset--;
  renderPlanner();
});

$("#nextWeek").addEventListener("click", () => {
  currentWeekOffset++;
  renderPlanner();
});

$("#thisWeek").addEventListener("click", () => {
  currentWeekOffset = 0;
  renderPlanner();
});

/* Очищення плану на вибраний тиждень */

$("#clearWeek").addEventListener("click", () => {
  if (!confirm("Очистити всі страви з плану на цей тиждень?")) {
    return;
  }

  const plan = getPlan();
  const monday = startOfWeek(currentWeekOffset);

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);

    delete plan[dateKey(date)];
  }

  savePlan(plan);
  renderPlanner();
  showToast("План на тиждень очищено");
});

/* Закриття вікон */

$("#closeRecipe").addEventListener("click", () => {
  recipeDialog.close();
});

$("#closeHelp").addEventListener("click", () => {
  helpDialog.close();
});

$("#showDataHelp").addEventListener("click", () => {
  helpDialog.showModal();
});

[recipeDialog, helpDialog].forEach(dialog => {
  dialog.addEventListener("click", event => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
});

/* Запуск сайту */

loadDishes();
