import path from "node:path";
import { axkit } from "eslint-config-axkit";

const gitignorePath = path.join(import.meta.dirname, ".gitignore");

export default axkit({ gitignorePath });
