module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	testMatch: ["**/__tests__/**/*.[jt]s", "**/?(*.)+(spec|test).[jt]s"],
	collectCoverageFrom: ["src/**/*.{js,ts}", "!src/**/*.d.ts"],
};
