# 账号设置上线

本次新增个人中心的头像、邮箱重新绑定和登录密码设置，以及邮箱密码登录。网页标识、浏览器标签图标与安装图标统一来自 `public/brand-mark.svg`。

部署新版服务前，对目标数据库运行 `npm run db:migrate:deploy`。迁移 `20261019000100_account_settings` 仅新增 `AccountProfile` 和 `AccountVerification` 表及关联，不修改已有账号数据。再运行 `npm run db:generate` 和 `npm run build`。生产环境继续使用现有 `AUTH_SECRET`、`EMAIL_API_KEY`、`EMAIL_FROM`；没有配置邮件服务时，账号验证码发送会明确失败。

已有用户无需迁移密码，仍可使用验证码登录，再在个人中心设置密码。重新绑定邮箱需要验证原邮箱与新邮箱，不会合并不同账号。修改邮箱或密码会撤销其他网页及小程序会话，并清除尚未使用的账号设置验证码，当前网页会话保留。

`APP_URL` 必须配置为用户实际访问的站点地址（含正确协议与端口），账号修改接口使用它校验浏览器请求来源；反向代理内部地址不能替代公开站点地址。

头像限制为 2 MB 以内的静态 JPG、PNG 或 WebP，服务器重新编码为 256×256 的 WebP 后保存在数据库中，通过仅本人可访问且禁止缓存的接口读取。

验证：`npm run test:auth-security` 包含密码、输入、验证码用途隔离、尝试次数、过期与并发消费测试。数据库测试只对本机 `zhixian_*test` / `zhixian_*e2e` 数据库执行。`npx playwright test tests/e2e/account-settings.spec.ts tests/e2e/interface.spec.ts` 使用既有隔离数据库指纹与测试验证码机制验证完整流程；不得对生产数据库运行。
