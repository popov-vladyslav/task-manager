# Task Manager "Log" — Design Brief for Claude Design

> Використання: створи новий проєкт у Claude Design (claude.ai/design) → тип "Prototype" → встав цей бриф як перший промпт. Мокапи v3 (mobile) і web — приклад узгодженого напрямку; jsx-файли можна прикріпити як референс-асети.

## Goal
Personal task manager для одного користувача (senior React Native engineer), який працює в кількох паралельних робочих контекстах. Основний ввід задач — через AI-чат (поза застосунком), тому застосунок — це насамперед інтерфейс перегляду, виконання і планування, а не форма вводу.

## Audience
Один користувач. Power user, Apple ecosystem, темні інтерфейси, звик до щільних інженерних тулів (VS Code, лінійні таск-трекери). Мови інтерфейсу: українська + англійська змішано (назви контекстів англійською, службові підписи українською).

## Platforms
Mobile-first (iPhone, 390px) + web (desktop, sidebar layout). Реалізація буде на Expo / React Native + React Native Web — уникати паттернів, які погано портуються (складні hover-стани як єдиний спосіб взаємодії, CSS-grid-залежні layout).

## Design system tokens

### Colors
- `bg/base`: #0B0E13 (page)
- `bg/surface`: #14181F (phone frame / main)
- `bg/card`: #1C222C (task cards, inputs) / web: #171C24
- `bg/elevated`: #262D39 (badges, secondary buttons)
- `border/subtle`: #262D39; `border/strong`: #3A4150
- `text/primary`: #EDEFF3; `text/secondary`: #8B93A3; `text/muted`: #5A6272; `text/faint`: #3A4150
- `accent/primary`: #E8A33D (amber — CTA, active tab, "сьогодні")
- `accent/timer`: #4FB6A9 (teal — активний таймер, done)
- `accent/reminder`: #9B7EDE (violet — нагадування)
- `accent/now`: #D9668B (rose — поточний час у календарі, high priority)

### Context colors (кожен робочий контекст має свій колір, використовується всюди консистентно)
- ZT (Zoolatech): #5B8DEF
- DA (DataArt): #4FB6A9
- Cairn: #E8A33D
- Zalando: #D9668B
- Home: #9B7EDE

### Typography
- UI: Inter (SF Pro на iOS як system-фолбек)
- Службові підписи, дати, лічильники: monospace (SF Mono / JetBrains Mono), uppercase, letter-spacing 0.15em, 10–11px
- Заголовки: 22px semibold, letter-spacing -0.02em
- Body: 14px; метадані на картках: 10px

### Shape & spacing
- Card radius: 12px (rounded-xl); sheet/modal radius: 24px top
- Кольорова смужка контексту: border-left 3px на кожній картці
- Pills для вибору (context/priority/recurrence): full radius, active = заливка кольором + темний текст

## Screens

### 1. Tasks (основний)
- Header: "Log — дата" (mono, uppercase) + заголовок "N open tasks"
- Горизонтальний ряд context-чипів з лічильниками: All / ZT / DA / Cairn / Zalando / Home
- Список карток: чекбокс, назва, ряд бейджів (context, priority-прапорець, дедлайн, нагадування 🔔, повтор ⟳ з датою наступного інстансу, лічильники 💬 фото 🖼), кнопка Play праворуч, grip-ручка для drag-to-reorder ліворуч
- Кнопка "Додати задачу" внизу → розкривається в inline-інпут
- Toast при виконанні: звичайна задача "Виконано ✓", циклічна "Виконано. Наступний раз: {дата}"

### 2. Task detail (bottom sheet на mobile / centered popup 560px на web)
- Назва — інлайн-редагування
- Context pills, Priority pills (High/Medium/Low)
- Дедлайн + Нагадування (два поля поряд, відкривають date/time picker)
- Повторення: Без повтору / Щодня / Щотижня / Щомісяця + підпис "Наступний інстанс: {дата}"
- Фото: сітка thumbnail 64px + кнопка camera "Додати"
- Коментарі: стрічка з датами + інпут
- "Видалити задачу" — danger zone внизу
- Всі зміни зберігаються одразу, без кнопки Save

### 3. Routine
- Денний чеклист з прогрес-баром (N/M) і часом кожного пункту
- Скидається щодня о 00:00 (підпис внизу)

### 4. Calendar
- Перемикач режимів: День / 3 дні / Тиждень / Місяць
- Таймлайн-режими: години 8:00–22:00, колонки днів, event-блоки в кольорах контекстів, лінія "зараз" (rose)
- Місяць: сітка, кольорові крапки задач у днях, тап по дню → режим "День"
- Тап по порожньому слоту → створення таймблоку для задачі

### 5. Timer (persistent bar)
- Mobile: панель над таб-баром (як "now playing"): пульсуюча крапка, назва задачі, час mono, кнопка Stop
- Web: картка внизу sidebar
- Обмеження: одна активна задача за раз — старт нової зупиняє попередню

## Navigation
- Mobile: bottom tab bar — Tasks / Routine / Calendar
- Web: left sidebar 240px — навігація + список контекстів з крапками-кольорами + таймер-картка внизу

## Key behaviors (для прототипування)
1. Циклічні задачі: у списку видно лише поточний інстанс; чек → зникає, наступний з'явиться у свій період
2. Drag-to-reorder працює і в All, і всередині окремого контексту
3. Нагадування — власні push-нотифікації (без Apple Reminders), бейдж 🔔 час на картці
4. Тап по картці → detail sheet/popup; чек і Play не відкривають деталі (stopPropagation)

## Anti-goals
- Не додавати: onboarding, мультиюзерність, шаринг, теми оформлення, вбудований AI-чат
- Уникати: світлої теми (тільки dark), декоративних градієнтів, крем/теракота палітри
