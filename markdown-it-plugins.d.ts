declare module "markdown-it-footnote" {
  import type MarkdownIt from "markdown-it"

  // markdown-it 插件签名：脚注语法用于 Typora 风格学术写作预览。
  export default function footnotePlugin(md: MarkdownIt): void
}

declare module "markdown-it-texmath" {
  import type MarkdownIt from "markdown-it"

  type TexmathOptions = {
    engine?: unknown
    delimiters?: string | string[]
    katexOptions?: Record<string, unknown>
  }

  // markdown-it-texmath 以函数形式挂载，并把 KaTeX 作为渲染引擎传入。
  export default function texmathPlugin(md: MarkdownIt, options?: TexmathOptions): void
}

declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it"

  type TaskListOptions = {
    enabled?: boolean
    label?: boolean
    labelAfter?: boolean
  }

  // GFM 任务列表插件：用于把 - [ ] / - [x] 渲染成 checkbox。
  export default function taskListsPlugin(md: MarkdownIt, options?: TaskListOptions): void
}
