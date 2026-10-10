# 临时依赖安全回补与验证

## 状态

- [x] braces 3.0.3 / `1240992`：已回补深度限制，真实栈溢出不再复现。
- [ ] node-forge 1.4.0 / `1240912`：待独立回补与验签回归，当前仍阻断审计。
- [ ] 最新 GitHub quality gate 全链路成功：两项回补完成后验证，不以本地通过代替。

没有扩大 `dependency-audit-baseline.json`。npm 原始报告仍按发布版本列出这些公告；项目门禁另外输出 `remediated`，仅在公告编号/包名匹配、锁定版本、所有安装实例与整个 JS/JSON 源树 SHA-256 完全匹配时认定该精确公告已回补。未知副本、未安装补丁、源文件被改、升级到未经审查版本、新公告、critical、审计网络错误都不能因此通过。

`npm ci` 的 postinstall 在 Prisma 前执行确定性回补。未知原始源码拒绝安装，不从第三方分支下载或运行代码；官方 npm 包的 LICENSE 保留。忽略安装脚本会留下未修复源码并被门禁阻断。官方发布安全版本后，升级、复测并删除对应临时回补，不长期维护依赖分支。

## braces 依据与范围

- 公告：[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)。官方 3.0.3 无已发布修复。
- 官方讨论：[70](https://github.com/micromatch/braces/issues/70)、[73](https://github.com/micromatch/braces/issues/73)、[84](https://github.com/micromatch/braces/issues/84)；维护者存在异议，但 [公告纠正 PR 10132](https://github.com/github/advisory-database/pull/10132) 本次核验仍未合并，不能当作撤销。
- 社区 [3.0.4 差异](https://github.com/Im-Fran/braces/compare/3.0.3...3.0.4) 的固定深度方案可参考，但含无关语义变动，未安装整个 fork，亦不声称获得维护者批准。
- 本地最小改动：brace/paren 开块前检查栈；compile/expand/stringify 独立递归检查，覆盖绕过 parser 的直接 AST。最大树深度 100（根占一层，可接受 99 层括号）；选项不能解除上限。常规范围、集合、转义、引号语义不变。不声称修复所有可能的展开输出爆炸问题。
- 修复前 4000 层 brace/paren、输入长度小于 10000，compile 真实 `RangeError: Maximum call stack size exceeded`；修复后明确 `SyntaxError`。
- 完整可执行/JSON 源树原始 SHA-256：`9da0231e9d18c6dc4bfe24c1f445ff3efcd935547a9bf8b4947a79e05ddc3964`；修复后：`298464a62b9ee11fd0e4448fa37140dcd1e3c7c0916f145be109617225c05297`。
- 新增攻击/正常行为/完整性 21 项，与既有审计 17 项实测 38/38；真实联网门禁已输出 braces 已回补，仍正确阻断 node-forge。发布专项与后续 CI 结果另行追加。
- 加入 6 项门禁集成反例后，默认发布专项 63/63、Lint 通过；未知节点、不同公告、critical 和包名不匹配均不能使用此回补放行。

## 发行边界

依赖回补通过不是正式发行完成。100 条人工研究评测、原生签名/真机、生产配置、备份恢复和迁移预演仍为未完成；不恢复生产 cron，不触碰生产数据库或发送真实通知。
