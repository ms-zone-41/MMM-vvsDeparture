import { defineConfig } from "eslint/config";
import globals from "globals";
import js from "@eslint/js";
import { configs as packageJsonConfigs } from "eslint-plugin-package-json";

export default defineConfig([
	{
		files: ["**/*.js", "**/*.mjs"],
		extends: [js.configs.recommended]
	},
	{
		// Runs in the browser of the mirror, with the globals of MagicMirror²
		files: ["MMM-vvsDeparture.js"],
		languageOptions: {
			sourceType: "script",
			globals: {
				...globals.browser,
				Log: "readonly",
				Module: "readonly",
				moment: "readonly"
			}
		}
	},
	{
		files: ["node_helper.js"],
		languageOptions: {
			sourceType: "commonjs",
			globals: globals.node
		}
	},
	packageJsonConfigs.recommended
]);
