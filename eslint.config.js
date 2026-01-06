import path from "node:path";
import { axpoint } from "eslint-config-axpoint";

const gitignorePath = path.join(import.meta.dirname, ".gitignore");

export default axpoint({ gitignorePath });
