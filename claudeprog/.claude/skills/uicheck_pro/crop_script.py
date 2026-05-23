from PIL import Image, ImageDraw
import os

DEV_PATH = "/Users/jinhui/Desktop/claudeprog/designer-platform/inputs/uicheck/1778225831029-jd6s2o-dev_screenshot.png"
DES_PATH = "/Users/jinhui/Desktop/claudeprog/designer-platform/inputs/uicheck/1778225831040-yc9g3w-design_mockup.png"
OUT_DIR = "/Users/jinhui/Desktop/claudeprog/.claude/skills/uicheck_pro/outputs"

dev_img = Image.open(DEV_PATH)
des_img = Image.open(DES_PATH)

RED = (255, 0, 0)
LINE_W = 3
PADDING = 15

def crop_and_box(src, box, crop_region, save_path, label_text=None):
    crop_region = [max(0, v) for v in crop_region]
    crop_region[2] = min(src.size[0], crop_region[2])
    crop_region[3] = min(src.size[1], crop_region[3])
    cropped = src.crop(crop_region)
    draw = ImageDraw.Draw(cropped)
    adjusted_box = [box[0] - crop_region[0], box[1] - crop_region[1], box[2] - crop_region[0], box[3] - crop_region[1]]
    draw.rectangle(adjusted_box, outline=RED, width=LINE_W)
    if label_text:
        text_x = adjusted_box[0]
        text_y = adjusted_box[1] - 20
        if text_y < 0:
            text_y = adjusted_box[3] + 5
        draw.text((text_x, text_y), label_text, fill=RED)
    cropped.save(save_path)

# Issue 1: 底部CTA按钮渐变样式与设计稿不一致
# Dev: 底部按钮区域 (蓝紫色按钮，位于页面底部)
# Design: 底部按钮区域 (紫红渐变圆角大按钮)
# Dev截图: 底部CTA按钮大约在 y=1600-1796 区域
# Design截图: 底部CTA按钮大约在 y=1580-1782 区域

issue1_dev_box = (40, 1600, 788, 1796)
issue1_dev_crop = (0, 1520, 828, 1796)
crop_and_box(dev_img, issue1_dev_box, issue1_dev_crop,
             os.path.join(OUT_DIR, "issue_1_dev.png"))

issue1_des_box = (40, 1560, 788, 1782)
issue1_des_crop = (0, 1480, 828, 1782)
crop_and_box(des_img, issue1_des_box, issue1_des_crop,
             os.path.join(OUT_DIR, "issue_1_design.png"))

# Issue A1: Banner区域装饰性礼盒/奖品插画疑似与设计稿风格不一致
# Dev: Banner区域 (顶部大Banner，含礼盒/奖品插画)
# Design: Banner区域 (顶部大Banner，含装饰插画)
# 两图Banner都在顶部区域

issueA1_dev_box = (100, 160, 728, 520)
issueA1_dev_crop = (0, 0, 828, 560)
crop_and_box(dev_img, issueA1_dev_box, issueA1_dev_crop,
             os.path.join(OUT_DIR, "issue_A1_dev.png"))

issueA1_des_box = (100, 160, 728, 520)
issueA1_des_crop = (0, 0, 828, 560)
crop_and_box(des_img, issueA1_des_box, issueA1_des_crop,
             os.path.join(OUT_DIR, "issue_A1_design.png"))

# Issue A2: 各卡片区域间距节奏与留白疑似与设计稿不同
# 这是一个模块级问题，需要框选多个卡片区域来展示间距
# Dev: 活动规则/奖品展示/参与步骤区域 (中段卡片区域)
# Design: 同样的卡片区域

issueA2_dev_box = (20, 540, 808, 1540)
issueA2_dev_crop = (0, 400, 828, 1560)
crop_and_box(dev_img, issueA2_dev_box, issueA2_dev_crop,
             os.path.join(OUT_DIR, "issue_A2_dev.png"))

issueA2_des_box = (20, 540, 808, 1520)
issueA2_des_crop = (0, 400, 828, 1540)
crop_and_box(des_img, issueA2_des_box, issueA2_des_crop,
             os.path.join(OUT_DIR, "issue_A2_design.png"))

print("All screenshots generated successfully!")
for f in sorted(os.listdir(OUT_DIR)):
    if f.endswith('.png'):
        fp = os.path.join(OUT_DIR, f)
        img = Image.open(fp)
        print(f"  {f}: {img.size}")
