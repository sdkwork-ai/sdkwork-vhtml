# RFC-0001：HTML 安全的核心元素命名

- 状态：已采纳（VHTML 1.1）
- 影响：不兼容 1.0 草案的 `<track>` / `<caption>`

## 背景

HTML5 树构建算法对部分元素有特殊规则：

- `<track>` 是 void element，`<track><clip/></track>` 中的 Clip 会成为兄弟节点。
- `<caption>` 在 table 上下文之外会被忽略。
- `<input>` 是 void element，不能包裹生成任务输入。

1.0 草案使用它们作为 VHTML 容器，导致文档在不同解析路径下结构不一致，
并且 DOM 中会产生错误的 HTML 语义。

## 决策

1. 容器改为 `<lane>`；字幕片段改为 `<cue>`。
2. 生成输入/输出改为 `<gen-input>` / `<gen-output>`。
3. `<track>` 出现时给出 `PARSE_HTML_AMBIGUITY` 并提示迁移。
4. 保留 `<output>` 作为项目级导出配置：它不是 void 元素，且在项目上下文中
   与 HTML 表单 `<output>` 语境可区分；在 Scene 内仍是 HTML 元素。

## 替代方案

- 全部使用 `v-track` 前缀：安全但可读性差。
- 自定义 XML 解析器：违反 HTML5 兼容目标。
- 强制 XHTML 自闭合：浏览器不会遵循。

## 迁移

```diff
- <track id="visuals" type="video">
+ <lane id="visuals" type="video">
...
- </track>
+ </lane>
- <caption start="1s" duration="2s" text="…" />
+ <cue start="1s" duration="2s" text="…" />
```

## 测试

- 多 Clip 解析为同一 Lane。
- `<track>` fixture 产生稳定诊断。
- `<caption>` 在 Scene 内仍按 HTML 表格标题保留。
