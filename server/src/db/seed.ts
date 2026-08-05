// No-op. Starter contexts are now created per account at sign-up (see
// createStarterContexts in ../services/contexts), because once `contexts` has a
// user_id column a deploy-time seed cannot know which user the rows would
// belong to. Kept as the `db:seed` entrypoint since Render's preDeploy hook
// still invokes it — it must not touch the database.
console.log('db:seed is a no-op — starter contexts are created per account at sign-up.');
