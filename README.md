# Figma → iOS, Android и Web

Единый генератор дизайн-токенов для бесплатной Figma. Он понимает DTCG JSON из **Export modes** и JSON локального демо-плагина.

## Запуск с экспортом Figma

Из корня проекта выполните:

```bash
node scripts/generate.mjs --input "/полный/путь/Mode 1.tokens.json"
npm test
```

Либо замените `tokens/tokens.json` экспортированным содержимым:

```bash
npm run generate
npm test
```

Генератор полностью пересоздаёт платформенные каталоги. Сгенерированные файлы нельзя редактировать вручную.

## Результат

```text
Package.swift                       ← точка входа удалённого SPM
generated/
├── ios/
│   └── Sources/DesignTokens/
│       ├── DesignTokens.swift
│       └── Resources/DesignTokens.xcassets/
├── android/
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── res/values/
│           ├── colors.xml
│           ├── dimens.xml
│           └── values.xml
└── web/
    ├── tokens.css
    ├── tokens.ts
    └── tokens.json
```

### UIKit

Корневой `Package.swift` ссылается на код внутри `generated/ios`. Поэтому весь Git-репозиторий является Swift Package и может подключаться по URL и тегу:

```swift
.package(
    url: "https://github.com/company/design-tokens.git",
    from: "1.2.0"
)
```

Для локальной проверки добавьте корневую папку проекта в Xcode через **File → Add Package Dependencies → Add Local…**.

```swift
import DesignTokens

view.backgroundColor = DesignTokens.colorBackground
button.backgroundColor = DesignTokens.colorAction
card.layer.cornerRadius = DesignTokens.radiusCard
```

Цвета находятся в Asset Catalog. Режим с именем `Dark` или `Night` автоматически становится тёмным вариантом цвета.

### Android Views

Скопируйте `generated/android/src/main/res` в Android library module либо используйте каталог как основу AAR-модуля.

```kotlin
button.setBackgroundColor(ContextCompat.getColor(this, R.color.color_action))
val spacing = resources.getDimensionPixelSize(R.dimen.spacing_card)
```

Числовые токены генерируются как `dp`; имена с `fontSize` или `lineHeight` — как `sp`. Режим `Dark`/`Night` попадает в `values-night`.

### Web

```css
@import "./generated/web/tokens.css";

.button {
  color: var(--color-action);
  border-radius: var(--radius-card);
}
```

Дополнительные режимы доступны через `[data-theme="имя-режима"]`.

## Git-флоу

1. Дизайнер изменяет Variables в Figma и выполняет **Export modes**.
2. JSON заменяется в `tokens/tokens.json`.
3. Запускаются `npm run generate` и `npm test`.
4. Исходный JSON и `generated/` добавляются в один pull request.
5. GitHub Actions проверяет результаты.
6. После merge каталоги публикуются как Swift Package, AAR и npm-пакет либо доставляются автоматизацией в приложения.

## Ограничения

- На Starter экспорт остаётся ручным; Variables REST API не требуется.
- Автоматическая системная тема поддерживается для пары Default/Light + Dark/Night.
- Обычные числовые токены считаются размерами. Имена `opacity`, `fontWeight`, `zIndex` и `scale` на Web считаются безразмерными.
- Источник истины — экспорт Figma в `tokens/tokens.json`; папку `generated` вручную не меняют.
