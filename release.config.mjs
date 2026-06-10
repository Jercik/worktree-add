const releaseConfig = {
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/npm",
    // successCommentCondition false: the default success step parses #N
    // references in commit messages and comments on each; a phantom number
    // (regex example, pasted error text) 404s and fails the whole release run.
    ["@semantic-release/github", { successCommentCondition: false }],
  ],
};

export default releaseConfig;
