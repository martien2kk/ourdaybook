# 同日簿（OUR DAYBOOK）微信云开发接入

> 本文档仅供开发者和运维人员使用，不应在小程序用户界面中展示。不要向用户暴露云环境 ID、集合结构、云函数名称或内部测试入口。

## 接入前准备

1. 申请正式微信小程序 AppID，并在微信开发者工具中使用该 AppID 导入项目。
2. 开通微信云开发，分别创建开发环境和生产环境。
3. 记录对应的云环境 ID；不要将生产环境 ID 写入截图、公开文档或用户可见页面。

## 数据库与存储

按照 [database-design.md](./database-design.md) 创建并配置以下集合：

- `users`
- `couples`
- `dailyTasks`
- `entries`
- `prompts`
- `meetings`
- `settings`

为情侣与每日记录相关字段建立必要的唯一索引，尤其是：

- `dailyTasks`：`coupleId + dateKey`
- `entries`：`coupleId + dateKey + ownerOpenid`

照片必须存放在私有云存储中。客户端不应拥有直接遍历或公开读取照片的权限。

## 部署云函数

项目当前包含：

- `cloudfunctions/ourDaybookApi`
- `cloudfunctions/ourDaybookCleanup`

在微信开发者工具中为每个云函数安装依赖并上传部署。API 云函数需要覆盖登录、资料、绑定、每日题目、提交、共同解锁、回忆、下次相遇、导出及销户等业务；清理函数负责过期或待清理数据。

## 配置小程序

仅在本地修改 `miniprogram/config/config.js` 的对应字段，保留其余业务限制和展示配置：

```js
// 合并以下字段到已有配置，不要覆盖其他字段。
{
  APP_NAME: 'OUR DAYBOOK',
  APP_MODE: 'cloud',
  ENABLE_MOCK_SWITCHER: false,
  ENABLE_DEBUG_TOOLS: false,
  ENABLE_UNLIMITED_PROMPT_REFRESH: false,
  CLOUD_ENV_ID: '填写真实云环境 ID'
}
```

公开提交前恢复演示配置、清空云环境 ID，并将 `project.config.json` 的 AppID 恢复为 `touristappid`。暂存文件后运行 `npm run check:privacy`。

生产版本必须保持：

- `APP_MODE` 为 `cloud`；
- 模拟用户切换器关闭；
- 调试日期等开发工具关闭；
- `CLOUD_ENV_ID` 指向生产环境。

## 必须遵守的安全原则

1. 云函数只能使用微信调用上下文中的 `openid` 判断身份，不能信任前端传入的 `userId`、`openid` 或 `coupleId`。
2. 每次读取或写入情侣数据前，都要在服务端验证调用者属于对应双人空间。
3. 双方尚未完成当天记录时，服务端不得返回对方的文字、照片 `fileID` 或临时下载链接。
4. 只有通过解锁权限检查后，云函数才能为私有照片生成短期有效的访问地址。
5. 邀请码必须有有效期、尝试次数限制与限流保护；数据库不应长期保存可直接滥用的明文凭证。
6. 绑定、题目生成和记录提交使用事务或唯一索引，避免重复加入、重复题目和重复记录。
7. 数据导出、解绑和销户必须重新校验身份。销户流程需删除或匿名化对应的个人资料、照片与记录。
8. 日志不得记录照片临时链接、邀请码、完整用户资料或其他敏感信息。

## 上线前验证

- 使用两台真实设备和两个微信账号完成创建空间、加入空间、双方提交和共同解锁。
- 确认任一方未提交时，另一方无法取得其照片与文字。
- 验证重新登录、跨日题目、更新记录、解绑、数据导出和销户流程。
- 验证云存储文件默认不可公开访问，临时链接会过期。
- 在开发环境完成测试后再部署至生产环境，不要让测试账号和生产数据共用集合。

## 本地回归测试

项目根目录执行：

```powershell
npm test
```

本地测试可验证业务结构和主要流程，但不能替代微信真机上的云权限、登录上下文、网络和存储测试。
