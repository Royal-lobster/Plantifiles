ALTER TABLE `plan` ADD `emoji` text;

UPDATE `plan`
SET `emoji` = CASE
	WHEN lower(`title`) LIKE '%billing%' THEN '🧾'
	WHEN lower(`title`) LIKE '%drift%' THEN '🧭'
	WHEN lower(`title`) LIKE '%ownership%' THEN '🤝'
	WHEN lower(`title`) LIKE '%approval%' THEN '✅'
	WHEN lower(`title`) LIKE '%mcp%' THEN '🔌'
	WHEN lower(`title`) LIKE '%table%' THEN '🧪'
	ELSE '📝'
END
WHERE `emoji` IS NULL;