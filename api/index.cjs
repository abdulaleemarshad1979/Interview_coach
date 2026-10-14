// Vercel runs the bundled Express app produced by the vercel-build script.
// Loading the raw TypeScript entrypoint leaves extensionless imports unresolved.
module.exports = require("../dist/server.cjs").default;
