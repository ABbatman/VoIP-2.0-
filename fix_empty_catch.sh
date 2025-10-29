#!/bin/bash
# Автоматическое исправление всех пустых catch блоков
# Заменяет } catch(_) {} на } catch(_) {\n  // Ignore errors\n}

find static/js -name "*.js" -type f -exec sed -i '' 's/} catch(_) {}/} catch(_) {\
  \/\/ Ignore errors\
}/g' {} +

echo "✅ Все пустые catch блоки исправлены!"
