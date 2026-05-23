from PIL import Image, ImageDraw
import os

DEV_PATH = '/Users/jinhui/Desktop/claudeprog/designer-platform/inputs/uicheck/1778219738661-mfdoa3-dev_screenshot.png'
DESIGN_PATH = '/Users/jinhui/Desktop/claudeprog/designer-platform/inputs/uicheck/1778219738671-0ygka4-design_mockup.png'
OUTPUT_DIR = '/Users/jinhui/Desktop/claudeprog/.claude/skills/uicheck_pro/outputs'

dev_img = Image.open(DEV_PATH)
design_img = Image.open(DESIGN_PATH)

DEV_W, DEV_H = dev_img.size  # 828, 1796
DES_W, DES_H = design_img.size  # 828, 1782

RED = (255, 0, 0)
LINE_W = 3

def crop_and_box(src, region, box_rel, label_text=None):
    x1, y1, x2, y2 = region
    crop = src.crop((x1, y1, x2, y2))
    bx1 = box_rel[0] - x1
    by1 = box_rel[1] - y1
    bx2 = box_rel[2] - x1
    by2 = box_rel[3] - y1
    draw = ImageDraw.Draw(crop)
    draw.rectangle([bx1, by1, bx2, by2], outline=RED, width=LINE_W)
    if label_text:
        draw.text((bx1 + 4, by1 - 18), label_text, fill=RED)
    return crop

def save(img, name):
    path = os.path.join(OUTPUT_DIR, name)
    img.save(path)
    print(f'Saved: {path} ({img.size})')

# Issue 1: Banner主视觉区域插画人物形象缺失
# Dev: 人物形象缺失，框Banner顶部区域显示缺失位置
# Design: 框人物插画形象

# Dev: Banner region - top area where the character should be
dev_banner_region = (0, 0, 828, 520)
dev_banner_box = (200, 40, 780, 500)  # area where character is missing

# Design: Character illustration in banner
design_banner_region = (0, 0, 828, 580)
design_person_box = (280, 30, 780, 520)  # the character illustration area

save(crop_and_box(dev_img, dev_banner_region, dev_banner_box, "人物形象缺失"), 'issue_1_dev.png')
save(crop_and_box(design_img, design_banner_region, design_person_box, "人物插画"), 'issue_1_design.png')

# Issue 2: Banner礼物盒装饰图案缺失
# Dev: gift box missing, box the area where it should be
# Design: box the gift box decoration

dev_gift_region = (0, 0, 828, 520)
dev_gift_box = (20, 100, 280, 400)  # left area where gift box is missing

design_gift_region = (0, 0, 828, 580)
design_gift_box = (20, 100, 260, 460)  # gift box decoration area on left

save(crop_and_box(dev_img, dev_gift_region, dev_gift_box, "礼物盒缺失"), 'issue_2_dev.png')
save(crop_and_box(design_img, design_gift_region, design_gift_box, "礼物盒装饰"), 'issue_2_design.png')

# Issue A1: Banner渐变背景色调疑似偏移
# Both: box the full banner gradient background area

dev_gradient_region = (0, 0, 828, 520)
dev_gradient_box = (0, 0, 828, 520)  # full banner background

design_gradient_region = (0, 0, 828, 580)
design_gradient_box = (0, 0, 828, 580)  # full banner background

save(crop_and_box(dev_img, dev_gradient_region, dev_gradient_box, "渐变背景"), 'issue_A1_dev.png')
save(crop_and_box(design_img, design_gradient_region, design_gradient_box, "渐变背景"), 'issue_A1_design.png')

# Issue A2: 奖励阶梯列表卡片图标风格疑似不一致
# Both: box the reward tier list area with icons

dev_list_region = (0, 440, 828, 1450)
dev_list_box = (30, 460, 798, 1440)  # the reward list module

design_list_region = (0, 500, 828, 1480)
design_list_box = (30, 520, 798, 1470)  # the reward list module

save(crop_and_box(dev_img, dev_list_region, dev_list_box, "奖励阶梯列表"), 'issue_A2_dev.png')
save(crop_and_box(design_img, design_list_region, design_list_box, "奖励阶梯列表"), 'issue_A2_design.png')

# Issue A3: 底部固定按钮样式疑似偏差
# Both: box the bottom fixed button area

dev_btn_region = (0, 1620, 828, 1796)
dev_btn_box = (200, 1640, 628, 1776)  # bottom button area

design_btn_region = (0, 1620, 828, 1782)
design_btn_box = (200, 1640, 628, 1762)  # bottom button area

save(crop_and_box(dev_img, dev_btn_region, dev_btn_box, "底部按钮"), 'issue_A3_dev.png')
save(crop_and_box(design_img, design_btn_region, design_btn_box, "底部按钮"), 'issue_A3_design.png')

print('\nAll screenshots generated successfully!')
