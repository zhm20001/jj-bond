# jj-bond：Agent 工作指南

## 项目定位与阅读入口

jj-bond 是 Jujutsu（`jj`）的桌面 GUI，使用 React / TypeScript / Vite 和
Tauri 2 / Rust。后端调用用户安装的 jj CLI，不直接操作 jj 的存储格式。
项目接近首个公开版本，优先保持已有行为、控制改动范围和提高可维护性。
许可证为 Apache-2.0。

开始任务时：

1. 用 `jj status`、`git status --short` 查看状态，保留用户已有改动。
2. 阅读 [中文 README](README.zh-CN.md) 获取启动方式；命令以 `package.json`
   和 `src-tauri/Cargo.toml` 为准。
3. 定位相关代码与测试，再修改；不要把开源整理扩大成无关的架构重写。
4. 完成对应验证，检查 diff，并按下文要求立即提交本次改动。

环境基线是 macOS、Node 24+、Rust stable；目前验证过 jj 0.46.0。
这不表示 Windows/Linux、其他 jj 版本或签名安装包已经通过验证。

## 代码地图与边界

| 路径 | 职责与修改注意事项 |
| --- | --- |
| `src/App.tsx` | 应用状态、选中项、加载与仓库操作编排 |
| `src/api.ts` | 桌面 Tauri invoke 和浏览器 HTTP 桥接适配 |
| `src/types.ts` | 前端数据类型，与 Rust 序列化结构保持一致 |
| `src/components/` | 图谱、详情、差异视图、工具栏与对话框 |
| `src/i18n.ts` | 中英文文案；用户可见字符串同步两种语言 |
| `src-tauri/src/lib.rs` | Tauri 命令注册及边界适配 |
| `src-tauri/src/jj.rs` | jj 调用、结果解析和集成测试夹具 |
| `src-tauri/src/graph.rs` | 图谱布局与排序逻辑 |
| `src-tauri/src/detail.rs` | diff 和详情解析 |
| `src-tauri/src/prefs.rs` | 配置目录、偏好序列化及兼容处理 |
| `scripts/jj-bridge.mjs` | 浏览器开发后端，含部分 Rust 行为的重复实现 |

桌面模式与浏览器模式都能修改真实仓库。修改命令语义、图谱、偏好或数据结构时，
检查 Rust、`src/api.ts`、`src/types.ts` 和开发桥接是否需要一起更新。
保留桌面与浏览器各自的偏好存储位置，不能假设二者共享配置。

## Rust 编程规约

以下要求约束新增或修改的代码。既有代码不一定全部符合；只修复任务涉及的部分，
避免为了统一风格制造全仓库 diff。

### 模块、类型与所有权

- Tauri 命令层负责参数接收、业务调用和错误转换。jj 操作放在 `jj.rs`，
  纯布局/解析留在相应模块，避免把业务算法堆进命令处理器。
- 状态和有限选项使用 enum；可缺省值使用 `Option`。保持领域含义清晰，
  尤其区分 change ID、commit ID、revset、书签名和文件路径。
- 只读参数优先使用 `&str`、`&Path`、切片；需要持有数据时再使用所有权类型。
  `clone()` 应对应明确的所有权需求，不为绕过借用错误而批量复制数据。
- 路径运算使用 `Path` / `PathBuf`；展示时再转换字符串，避免把非 UTF-8 路径
  强制 `to_str().unwrap()`。不要硬编码开发者目录或固定临时目录。
- 注释解释约束、协议及选择原因；对外可复用函数说明输入、输出和失败条件。

### 错误与副作用

- 应用内部沿用 `anyhow::Result`，在 IO、子进程及解析失败处用 `Context` /
  `with_context` 补充操作语义。到 Tauri 边界再转为前端可处理的错误。
- 对用户输入、仓库状态、文件 IO、子进程结果使用可恢复错误处理。
  生产路径避免 `unwrap()` / `expect()`；确有不可达不变量时写明依据。
  测试断言和夹具可使用带清晰信息的 `expect()`。
- 关键写入失败必须传播。允许 best-effort 的行为需说明理由，不能用
  `let _ = ...` 掩盖影响用户数据或操作结果的失败。
- 保留正常程序对用户 jj 配置的支持；测试隔离策略不能泄漏到发行构建。
- 默认使用安全 Rust。若确需 `unsafe`，限制作用域并写明安全不变量与验证方式。
- 先明确耗时操作的阻塞边界。新增异步命令中的同步进程或 IO 使用合适的阻塞任务
  边界，避免阻塞异步执行线程；不要仅为形式统一把整个同步后端改成 async。

### jj 子进程与解析

- 复用 `run_jj` / `run_jj_owned`，通过 `Command` 的独立参数传值；
  不拼接 shell 命令，不用 `sh -c` 解释仓库路径或用户输入。
- 显式指定目标仓库及工作目录，检查退出状态，同时保留有用的 stderr 上下文。
  区分“命令启动失败”“jj 返回失败”和“输出解析失败”。
- 文件路径等位置参数在命令支持时放在 `--` 后；同时检查目标子命令的参数语义，
  不能把 shell 转义当作 CLI 参数验证。
- 解析结构化、明确格式的输出；处理空输出、Unicode、转义、重命名、二进制文件
  等相关边界。不要依赖终端颜色、固定示例 ID 或本地化展示文本。
- 修改仓库的操作保持现有确认和刷新语义，不能将失败包装成成功消息。
  新增破坏性操作需要显式用户交互设计和临时仓库回归测试。

### 数据契约与偏好兼容

- 尊重已有 `#[serde(rename_all = "camelCase")]` 契约。字段变更同时检查前端类型、
  invoke 参数、桥接响应和调用方，而非只让 Rust 编译通过。
- 新增持久化字段提供合理的 serde 默认值；重命名旧字段时评估 alias 或迁移。
  添加旧配置反序列化测试，避免升级后丢失偏好或无法启动。
- 沿用平台配置目录；不要将真实仓库路径、个人配置或凭据写入测试快照和日志样例。

### 测试与工具检查

- 纯函数优先通过单元测试覆盖行为。真实 jj 行为复用 `jj.rs` 的 `TestRepo`：
  每个测试拥有临时仓库、动态获取 ID、结束清理，不依赖私人仓库。
- 外部 jj 缺失或夹具创建失败应使集成测试失败，不能静默跳过后报告通过。
- 测试子进程显式隔离 `JJ_CONFIG`；当前 `run_jj` 在 `cfg(test)` 下也执行隔离。
  新增命令路径需保持一致，避免在并行测试中修改进程全局环境变量。
- 断言实际结果或仓库状态；撤销/重做不能仅断言命令退出成功。
- Rust 修改运行下面的测试，并检查格式与 Clippy。已有格式或 lint 问题单独报告，
  只处理本次引入的问题，不自动扩大改动或用全局 allow 隐藏诊断。
  当前 `lib.rs` 的 `allow(dead_code)` 是既有状态，不是添加新豁免的范例。

```sh
npm run test:rust -- --locked
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets
```

## 验证与交付

- 前端或共享数据契约修改：`npm run check`。
- Rust 行为修改：运行上面的 Rust 检查；按改动补充回归测试。
- 图标、Tauri 配置或打包资源修改：在本机运行
  `npm run tauri build -- --bundles app`，并检查包内资源；此命令针对 macOS。
- 纯文档修改：核对命令、路径、链接和 `git diff --check`，无需机械重跑编译。
- 交付时区分已通过的检查、未运行的检查及原因，不能将编译成功等同于 GUI 实测。

本项目使用 jj 进行版本管理，当前为 colocated Git 仓库。遵循维护者要求：提交一律用
jj 创建，不要用 `git commit` / `git add` 写历史——直接 git commit 基于 git HEAD，
会与 jj 的工作副本提交（@）形成兄弟分支，每次提交后遗留悬挂快照。每个独立改动
完成后立即定稿：先看 `jj status`，工作副本只包含本次改动时执行
`jj commit -m "简要说明"`；混有用户或其他任务的改动时执行
`jj split <本次涉及的文件…> -m "简要说明"`，选中的文件进入带说明的提交，其余
改动保留在 @ 中，历史保持线性。Git 侧仅做只读检查与远端同步。不要并行执行修改
历史或索引的 jj/Git 命令。推送、发布和重写已有历史需有用户授权。

## 按任务读取的补充资料

- 修改启动流程或贡献说明：阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，同步中英文 README。
- 发布、许可证、依赖变更：阅读 [发布清单](docs/RELEASING.md)、
  [第三方依赖说明](THIRD_PARTY_NOTICES.md) 和 [依赖清单](docs/DEPENDENCIES.md)。
- 核对验证基线：阅读 [验证记录](docs/VERIFICATION.md)，注意其中记录的日期及范围。
- 修改图标：阅读 [图标说明](assets/README.md)，以其中指定的主图和生成流程为准。
