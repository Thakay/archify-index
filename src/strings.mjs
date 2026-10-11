// The index page's own words, in English and Simplified Chinese. Diagram titles are never
// translated; they are the author's. A type this table does not name is shown as Archify names it.

export const LANGUAGES = ['en', 'zh-CN'];

export const STRINGS = {
  en: {
    pageTitle: 'Diagrams',
    tabsLabel: 'Diagrams',
    openAlone: 'Open alone',
    openAloneLabel: 'Open {title} alone, in a new tab',
    theme: 'Theme',
    themeAuto: 'Auto',
    themeLight: 'Light',
    themeDark: 'Dark',
    keys: 'Keys 1 to 9, ← →',
    keysHelp: 'Keys 1 to 9 choose a diagram and the arrow keys move between them while this page has focus. Inside a diagram, its own keys apply; click the top bar to come back.',
    noScript: 'Switching diagrams needs JavaScript. Each diagram also opens on its own:',
    types: {
      architecture: 'Architecture',
      workflow: 'Workflow',
      sequence: 'Sequence',
      dataflow: 'Data flow',
      lifecycle: 'Lifecycle',
      erd: 'Entity relationship',
      tree: 'Hierarchy',
      class: 'Class',
      timeline: 'Timeline',
      waterfall: 'Waterfall',
    },
  },
  'zh-CN': {
    pageTitle: '图表',
    tabsLabel: '图表列表',
    openAlone: '单独打开',
    openAloneLabel: '在新标签页中单独打开 {title}',
    theme: '主题',
    themeAuto: '自动',
    themeLight: '浅色',
    themeDark: '深色',
    keys: '按 1 到 9 或 ← → 切换',
    keysHelp: '焦点在本页时，按 1 到 9 选择图表，按方向键在图表间切换。焦点在图表内时按键由图表处理；点击顶部栏即可返回。',
    noScript: '切换图表需要 JavaScript。每个图表也可以单独打开：',
    types: {
      architecture: '架构图',
      workflow: '工作流',
      sequence: '时序图',
      dataflow: '数据流',
      lifecycle: '生命周期',
      erd: '实体关系图',
      tree: '层级结构图',
      class: '类与接口图',
      timeline: '事件时间线',
      waterfall: '执行瀑布图',
    },
  },
};

/** The words for a diagram type, or the type's own name when this table has none. */
export const typeLabel = (strings, type) => strings.types[type] ?? type;
