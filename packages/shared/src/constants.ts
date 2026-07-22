// Domain constants shared by the app and the server.

// A task with a deadline always gets a calendar block; this is its default length
// (minutes) unless the user picks another. Used by the server (task/calendar
// services) and the app (calendar draft-create).
export const DEFAULT_DURATION_MIN = 30;
