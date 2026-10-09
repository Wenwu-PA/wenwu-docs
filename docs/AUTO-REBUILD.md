# Автоматическое обновление контента

Сайт `wenwu-docs` пересобирается каждые 30 минут и после `repository_dispatch`. Workflow без PAT читает публичный `Wenwu-PA/IT-TOP_academy`. SHA исходного коммита сохраняется в `public/data/content-sha.txt`; повторный запуск с тем же SHA пропускает сборку и публикацию. `workflow_dispatch` всегда запускает сборку вручную. В браузере `data/version.json` проверяется без кеша; при новой сборке появляется кнопка обновления. Внизу сайта показываются дата сборки контента и ссылка на исходный коммит.

## Мгновенное обновление после push

Чтобы не ждать следующего расписания, создайте workflow в исходном репозитории по пути `.github/workflows/notify-archive.yml`:

```yaml
name: Notify Wenwu archive

on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - name: Request archive rebuild
        uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.SITE_DISPATCH_TOKEN }}
          repository: Wenwu-PA/wenwu-docs
          event-type: content-updated
          client-payload: '{"source": "IT-TOP_academy"}'
```

Создайте fine-grained personal access token со следующими настройками:

1. Repository access: только `Wenwu-PA/wenwu-docs`.
2. Repository permissions: `Contents` — `Read and write`.
3. Срок действия: 90 дней.
4. В `IT-TOP_academy` откройте **Settings → Secrets and variables → Actions → New repository secret**.
5. Имя секрета: `SITE_DISPATCH_TOKEN`; значение токена введите непосредственно в GitHub Secrets.

Не отправляйте токен в чат, не добавляйте его в файлы или `.env`. Если секрет не настраивать, обновление всё равно произойдёт в течение 30 минут.

## Ручной запуск и Pages

В репозитории `wenwu-docs` откройте **Actions → Build and deploy archive → Run workflow**. GitHub Pages должен быть настроен на **Settings → Pages → Build and deployment → Source: GitHub Actions**. Публикуемая ссылка: <https://wenwu-pa.github.io/wenwu-docs/>.
