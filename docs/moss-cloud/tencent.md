# 腾讯云部署候选与开通门槛

用户已选择腾讯云，并完成指定主账号登录。当前核价和免费部署准备，不创建付费资源；正式页面仍是 0.9.2。

当前实查：广州配置页面可选 GN7vw.LARGE16（1/4 T4、4 GiB 显存、4 CPU、16 GiB 内存），旧小规格计算卡禁用。仅选入未提交表单，不表示库存锁定或 GPU 可用。TCR 的默认共享实例明确显示“免费限额使用”，已完成平台服务角色授权、个人仓库凭据初始化和私有仓库创建。SCF 已添加官方仅拉取镜像策略 QcloudAccessForSCFRoleInPullImage；不需要广泛授权所有 COS/CLS/APIGW 操作。

实际构建检查已经通过：https://github.com/pupu838/classroom-enhancer/actions/runs/39107377483 。Linux amd64 镜像监听 9000，未认证请求 401、认证后的无效输入 400，均未启动 GPU。OCI 压缩层合计 **3,368,645,049 字节（3.37 GB）**，超过文档默认镜像限额；需额度确认或缩减镜像后才能部署。此检查没有 GPU、音质或 iPad 结论。

## 预定方式

优先 SCF Web 函数 + 同地域私有 TCR 镜像，按需触发，最低零实例，不设置预置并发；在创建 HTTP 入口前把函数预留并发上限设为 1，单实例单请求。模型与源码随镜像，不在冷启动时从境外下载。处理端口固定 9000，执行超时建议 60 秒，网关现有超时 50 秒。不开公网 URL 输入，不需要学校密码。

本机验证仍不能代替真实卡型的 CUDA 12.8/cuDNN 9 兼容性和吞吐检查。禁止为了“先跑通”启用 CPU 回退或自动购买更大规格。

## 账户必须核对

1. 账户可用地域、GPU 卡型和权限。已存的 ASR 密钥对 SCF 查询返回 UnauthorizedOperation，不能用于自动部署。
2. 最小可用规格：GN7vw.LARGE16 是官方在表的 1/4 T4、4 CPU、16 GiB 内存渲染规格，但不保证本账户可购或满足此模型的 CUDA/显存需求。不得选用已停售的 GN7.LARGE20 / GN7.2XLARGE40；GN7.2XLARGE32 限 SD 场景。
3. GPU 存量和按需供应。预置并发会有闲置费用，因此暂不为了保证供货而设置常驻。
4. 镜像配额：官方 WebServer 文档写解压前 <1GB；超限需平台确认。自动镜像检查报告会提供压缩 OCI 层总量，超过默认限额不部署。
5. 私有 TCR 同地域可用性和限额。个人版限额免费但不承诺 SLA；不自动购买企业版仓库。SCF 必须与仓库同地域。
6. 创建时的实际报价与首轮测试预算。仅发两个短请求，无自动重试；成功后核对账单，再确定持续听课预算。

## 费用口径

公开资源单价 0.00011108 元/GB秒，GPU 同样按配置内存和时间计费。仅供核价：

| 配置内存 | 累计执行 1 小时资源费 | 累计执行 15 分钟资源费 |
| --- | ---: | ---: |
| 16 GiB | 6.40 元 | 1.60 元 |
| 32 GiB | 12.80 元 | 3.20 元 |
| 80 GiB | 31.99 元 | 8.00 元 |

这不是“每节课”价格。冷启动、运行模式、处理速度、倍速预取、流量、调用和镜像服务等会影响实付。大陆/新加坡出流量公开价 0.8 元/GB，中国香港 1 元/GB。费用以控制台报价、真实账单为准。

## 构建与接入

`cloud/Moss.Dockerfile` 与专用 dockerignore 只包含公开源码、固定 ONNX 和许可证。GitHub 的 Moss Tencent image readiness 工作流构建与检查镜像；仅在已配置私有仓库地址和加密凭据时，推送使用提交 SHA 固定的镜像版本。不会创建 SCF 或调用付费 GPU。工件只含体积/监听验证结果，未提供服务。仓库密码仅保存在受 Git 忽略的本机配置和 GitHub Secret；不进入镜像上下文。

SCF 函数 URL 必须启用 CAM 鉴权，应用后台独立口令使用 X-CE-Moss-Token，避免与 TC3 Authorization 冲突。EdgeOne 增加 CE_MOSS_SCF_SECRET_ID / CE_MOSS_SCF_SECRET_KEY / CE_MOSS_SCF_UIN（临时密钥另带 CE_MOSS_SCF_SESSION_TOKEN），仅授予目标函数的 scf:InvokeFunctionUrl。不要用 ASR-only 凭据，也不要把主账号管理密钥放进后台。缺少专用 CAM 配置时，健康检查仍返回未开通。

已创建上述单函数调用策略 ce-moss-invoke-only；用户已完成验证码，专用编程用户 classroom-moss-invoker 创建完成、仅绑定该策略，无控制台登录权限。密钥已保存私有环境；没有复用 ASR 凭据。用户在明确说明首轮只发两次短请求、预算不超过 5 元、不常驻、不自动升级规格后要求继续，按该范围推进。尚未创建或调用 GPU。

整流上传超时后改用标准 Registry V2 的8MiB分块传输，逐层SHA检查并跳过已存在层，任务和恢复次数有界。真实免费个人仓库的2MiB及32MiB合成数据上传通过；完整模型镜像仍需完成上传和平台额度检查。流水线不再同时向同一个个人仓库进行两次大镜像上传。

授权和配额齐备后：将同一镜像推入已确认的私有 TCR → 创建无公网触发器的函数并限制并发 → 配置随机独立处理口令 → 配置 HTTPS 入口 → 用 check-moss-remote.py 发两次请求 → 验证 GPU、音质、冷/热吞吐与账单 → 真实回放持续验证 → 发布 0.10.0 并开启 CE_MOSS_ENABLED。开关关闭前不改线上入口。

停用：先关闭 EdgeOne 的 CE_MOSS_ENABLED，再将函数预留并发设为 0、移除触发器；未配置预置并发。镜像和函数配置留存是否产生存储费用需看所用仓库；不能只关闭网页就宣称所有费用停止。

## 官方来源（2026-10-18 核对）

- 规格：https://cloud.tencent.com/document/product/583/68734
- 定价：https://cloud.tencent.com/document/product/583/12281
- WebServer/镜像限制：https://cloud.tencent.com/document/product/583/56051
- TCR 计费：https://cloud.tencent.cn/document/product/1141/40540
- 函数 URL 鉴权：https://cloud.tencent.com/document/product/583/96100
