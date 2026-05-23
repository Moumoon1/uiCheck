# 输出字段规范

分析阶段只允许输出一个 JSON 代码块，且每条问题都必须包含后续截图生成所需字段。

## 顶层结构

```json
{
  "confirmed": [],
  "suspected": []
}
```

## confirmed 每条必填字段

```json
{
  "id": "1",
  "problem": "一句话问题描述",
  "suggestion": "一句话修改建议",
  "priority": "P0",
  "status": "待修改",
  "location": "问题所在区域",
  "devCropRegion": {"top": 0.0, "bottom": 0.2, "left": 0.0, "right": 1.0},
  "devBox": {"top": 0.02, "bottom": 0.1, "left": 0.1, "right": 0.5},
  "designCropRegion": {"top": 0.0, "bottom": 0.2, "left": 0.0, "right": 1.0},
  "designBox": {"top": 0.02, "bottom": 0.1, "left": 0.1, "right": 0.5}
}
```

## suspected 每条必填字段

```json
{
  "id": "A1",
  "problem": "一句话疑似问题描述",
  "suggestion": "一句话建议",
  "priority": "P2",
  "status": "待确认",
  "location": "疑似所在区域",
  "devCropRegion": {"top": 0.2, "bottom": 0.35, "left": 0.0, "right": 1.0},
  "devBox": {"top": 0.22, "bottom": 0.3, "left": 0.08, "right": 0.45},
  "designCropRegion": {"top": 0.2, "bottom": 0.35, "left": 0.0, "right": 1.0},
  "designBox": {"top": 0.22, "bottom": 0.3, "left": 0.08, "right": 0.45},
  "reason": "为什么怀疑有问题",
  "basis": "截图中可见的证据",
  "whyNotConfirmed": "暂不能确认为正式问题的原因",
  "verifySuggestion": "建议如何进一步确认"
}
```

## 坐标规则

- 所有坐标字段必须使用 0.0 到 1.0 的比例值。
- `CropRegion` 表示截图裁切上下文范围，`Box` 表示需要画红框的精确元素。
- **devCropRegion 和 designCropRegion 必须完全相同**，确保两张截图的视窗范围对齐，用户才能做左右对比。
- **devBox 和 designBox 必须分别独立定位**，不能复制相同坐标。同一元素在 dev 和 design 中的实际位置往往不同，必须在各自图片中单独读取位置后再填写。复制坐标会导致一张图框准、另一张框歪。
- 开发图和设计图必须分别识别，不允许把一张图的 Box 位置直接照搬到另一张图（禁止坐标投影）。
- 不要输出 `dev_y` / `design_y` 作为主字段；如果额外输出也不能替代上述四个坐标对象。
- 任一问题缺少 `devCropRegion`、`devBox`、`designCropRegion`、`designBox` 时，后续 Python 截图会失败。
