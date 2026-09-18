-- The category palette was redrawn (2026-09-19) as 15 clearly different hues in one muted style.
-- Move categories that use an old palette colour to its counterpart; custom colours stay as they are.
UPDATE contexts
SET color = CASE upper(color)
  WHEN '#5B8DEF' THEN '#5597E9'
  WHEN '#4AA3D9' THEN '#49BFD9'
  WHEN '#6A6FDB' THEN '#6D74D8'
  WHEN '#9B7EDE' THEN '#A479DE'
  WHEN '#C77DD6' THEN '#C770C1'
  WHEN '#D9668B' THEN '#E78AAA'
  WHEN '#E0574B' THEN '#DF6862'
  WHEN '#EB7F45' THEN '#E7844D'
  WHEN '#E8A33D' THEN '#EEA743'
  WHEN '#E3C349' THEN '#E6CE57'
  WHEN '#9DBE4B' THEN '#9DCD53'
  WHEN '#6BBF59' THEN '#5DB96E'
  WHEN '#4FB6A9' THEN '#3DB8A7'
  WHEN '#A8835F' THEN '#9A7050'
END
WHERE upper(color) IN (
  '#5B8DEF', '#4AA3D9', '#6A6FDB', '#9B7EDE', '#C77DD6', '#D9668B', '#E0574B',
  '#EB7F45', '#E8A33D', '#E3C349', '#9DBE4B', '#6BBF59', '#4FB6A9', '#A8835F'
);
