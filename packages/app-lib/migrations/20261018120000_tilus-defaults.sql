-- Tilus Launcher defaults: minimize the launcher while the game runs (its WebView then stops drawing),
-- bring it back when the game closes, and start in Russian.
UPDATE settings
SET
	hide_on_process_start = TRUE,
	refocus_on_game_close = TRUE,
	locale = CASE WHEN locale IN ('ru-RU', 'uk-UA', 'kk-KZ') THEN locale ELSE 'ru-RU' END;
