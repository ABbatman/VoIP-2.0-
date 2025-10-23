// __tests__/storyshots.test.js
// Minimal StoryShots setup to snapshot all stories
// Note: requires dev dependency '@storybook/addon-storyshots'

const initStoryshots = require('@storybook/addon-storyshots').default;

// Use default configuration: picks up .storybook configuration
// and snapshots all CSF stories.
initStoryshots({
  /* keep minimal; HTML framework is configured in .storybook/main.js */
});
