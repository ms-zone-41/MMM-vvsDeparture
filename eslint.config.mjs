import { defineConfig } from "eslint/config";
import globals from "globals";
import js from "@eslint/js";

export default defineConfig([
	{
		files: ["**/*.js", "**/*.mjs"],
		extends: [js.configs.recommended]
	},
	{
		// Runs in the browser of the mirror, with the globals of MagicMirror
		files: ["MMM-vvsDeparture.js"],
		languageOptions: {
			sourceType: "script",
			globals: {
				...globals.browser,
				Log: "readonly",
				Module: "readonly"
			}
		}
	},
	{
		files: ["node_helper.js", "tests/**/*.js"],
		languageOptions: {
			sourceType: "commonjs",
			globals: globals.node
		}
	}
]);
