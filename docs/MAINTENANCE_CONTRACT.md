# Контракт обслуживания Altron

Модуль `altron.dashboard.maintenance` — standalone-модуль только стандартной библиотеки Python. Он не импортирует `plugin_api.py`, конфигурацию или креды.

## API

```python
Maintenance(profile_home, desktop_home)
stage(archive_bytes: bytes, expected_sha256: str) -> dict
apply(stage_id: str) -> dict
rollback() -> dict
status() -> dict
```

`profile_home` и `desktop_home` — абсолютные существующие каталоги. В профиле должны существовать `plugins/altron`, `altron/altron.db`; в Desktop — `desktop-plugins/altron`. `desktop_home` может совпадать с `profile_home`.

`stage` сначала проверяет весь tar-архив и его опубликованный lowercase SHA-256, затем пишет только в `profile_home/altron/maintenance`. Ответ содержит `id`, `version` и отсортированный список `files` без префикса `altron/`. До успешного `stage` установленные файлы не изменяются. Проверка следующего пакета сохраняет предыдущую операцию и ссылку на резервную копию, пока новое применение не создаст следующую копию; одна проверка архива не лишает пользователя возврата.

`apply` принимает только совпадающий ранее staged ID. Ответ:

```json
{"status":"applied","requires_restart":true,"version":"0.3.0","backup_id":"..."}
```

`rollback` возвращает `{"status":"rolled_back","requires_restart":true}`. Старая копия кода восстанавливается, текущая `altron.db` не заменяется.

`status` возвращает `status`, `version`, `backup_id`, `requires_restart`. Возможные обычные состояния: `idle`, `staged`, `applied`, `rolled_back`. Для незаконченной, провалившейся или повреждённой операции возвращается `recovery_required`.

## Архив

Единственный корень — `altron/`. Обязательный `altron/release.json` имеет ровно такую структуру:

```json
{"format":1,"version":"0.3.0","data_version":1,"files":{"plugins/altron/__init__.py":"<64 lowercase hex>"}}
```

`files` перечисляет каждый архивный файл, кроме `release.json`, и хеширует путь относительно `altron/`. Управляемые файлы находятся только под `plugins/altron/` и `desktop-plugins/altron/`. Разрешённые корневые документы `config.yaml`, `SOUL.md`, `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md` проверяются и сохраняются в staged-пакете, но никогда не заменяются. Обязательны:

- `plugins/altron/__init__.py`;
- `plugins/altron/plugin.yaml`;
- `plugins/altron/dashboard/plugin_api.py`;
- `desktop-plugins/altron/plugin.js`.

Поддерживаются tar и gzip/tar. Распаковка gzip ограничена до разбора tar; чрезмерные заголовки/метаданные и слишком большой распакованный поток отклоняются. Лимиты: архив до 16 MiB, до 128 файлов, каждый файл до 8 MiB, суммарно до 32 MiB. Отклоняются traversal, абсолютные/drive/backslash/NUL-пути, дубликаты и case-fold коллизии, неразрешённые пути, symlink/hardlink/special/sparse entries, `.env*`, `auth.json`, `credentials.json`, `*.db`, `*.log`, неверные манифесты, версии и хеши.

## Журнал и резервные копии

Журнал — `altron/maintenance/journal.json`, формат `schema: 1`:

```json
{
  "schema": 1,
  "events": [{"event":"staged", "stage_id":"...", "files":{"path":{"sha256":"...","size":1}}}],
  "stage": {"id":"...", "version":"...", "data_version":1, "files":{}, "archive_sha256":"...", "stage_dir":"stages/..."},
  "operation": {"kind":"apply", "state":"applied", "stage_id":"...", "backup_id":"...", "files":[], "applied":[]},
  "version": "...",
  "backup_id": "...",
  "requires_restart": true
}
```

`events` фиксируют порядок действий и подлинные старые/новые SHA-256. В `backups/<backup_id>/backup.json` сохраняются записи затронутых файлов, старые байты в `code/`, staged новые байты в `new/` и проверенная SQLite-копия `altron.db`. Неизвестные локальные файлы не удаляются.

Применение удерживает атомарный профильный lock и общий Desktop lock. Чужой или оставшийся после аварии lock не снимается автоматически. Сначала валидируется `user_version=1`, структура `altron_projects` и JSON документов: запрещены `prepared`, `running`, `unknown`, `cancel_requested`, `reported` без terminal status и team-статусы `ready`, `running`, `paused`, `unknown`. Блокировка записи SQLite удерживается до конца замены/возврата, поэтому новый запуск не вклинивается между проверкой и изменением кода. После этого создаётся SQLite backup через `Connection.backup`, выполняется `PRAGMA integrity_check`, а код меняется только через `os.replace`.

Если компенсация отказала, состояние журнала — `recovery_required`. Следующий `status` не сообщает об успехе. Явный `rollback` снова требует оба lock; он не снимает чужой lock, проверяет совместимость текущей БД и восстанавливает только файлы, чьи текущие байты соответствуют staged новой версии. Для обычного `applied` rollback сначала проверяет все затронутые файлы целиком, поэтому частичное восстановление при изменённом пользователем файле не начинается. Новые файлы удаляются только если их хеш всё ещё соответствует установленной версии.

## Стабильные коды ошибок

`MaintenanceError` наследуется от `ValueError`; строковое представление всегда равно машинному коду:

`paths_must_be_absolute`, `invalid_profile_home`, `invalid_desktop_home`, `invalid_profile_code`, `invalid_profile_data`, `invalid_database`, `invalid_desktop_code`, `path_is_link`, `lock_exists`, `journal_invalid`, `archive_bytes_invalid`, `expected_sha256_invalid`, `archive_too_large`, `archive_checksum_mismatch`, `invalid_archive`, `archive_path_invalid`, `forbidden_archive_file`, `archive_member_type`, `archive_file_too_large`, `archive_total_too_large`, `archive_file_count_too_large`, `archive_path_not_allowed`, `release_manifest_missing`, `release_manifest_invalid`, `release_format_unsupported`, `version_invalid`, `data_version_unsupported`, `invalid_manifest_path`, `duplicate_archive_path`, `duplicate_manifest_path`, `manifest_hash_invalid`, `manifest_file_set_mismatch`, `file_hash_mismatch`, `missing_required_file`, `stage_not_found`, `staged_file_changed`, `update_pending`, `database_incompatible`, `database_invalid`, `active_operations`, `invalid_code_path`, `database_backup_invalid`, `apply_verification_failed`, `apply_failed`, `code_changed`, `backup_invalid`, `no_applied_update`, `recovery_required`.

Повторное применение того же staged ID после успешной установки отклоняется как `update_pending`, чтобы не потерять исходную резервную копию. Перед возвратом сверяются все старые файлы резервной копии, их размеры, хеши и безопасные пути. HTTP API сохраняет идентификатор процесса применения: перезагрузка одного модуля не считается перезапуском сервера.

Интегратор должен показывать пользователю код, не подменяя его текстом исключения и не продолжая применение после `recovery_required`.
