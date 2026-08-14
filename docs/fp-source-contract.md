# FP技能検定：官方来源与字段契约

资格 slug：`fp`。这是国家检定，但由两个指定试验机构实施，公开事实必须同时记录实施机构、等级、考试组成和实施方式。

## 实施机构

- `jafp`：日本FP協会。实施2级、3级学科和“資産設計提案業務”实技；1级仅实施“資産設計提案業務”实技。
- `kinzai`：金融財政事情研究会。实施1级学科和“資産相談業務”实技，以及2级、3级学科与多种实技业务。

## 必需维度

- `provider_id`：`jafp` / `kinzai`
- `exam_level_id`：`fp:1` / `fp:2` / `fp:3`
- `exam_component`：`academic`，或带业务类型的 `practical:*`
- `delivery_mode`：`cbt` / `pbt` / `interview`
- `exam_year`、`fact_key`、官方来源、快照和证据原文

2级、3级学科与实技原则上按 CBT 建模。1级不得套用该规则，必须按机构与具体科目从官方页面提取。

首批字段：`exam_method`、`exam_schedule`、`exam_date`、`exam_time`、`question_count`、`question_format`、`passing_standard`、`fee`、`eligibility`、`practical_subject`。所有字段进入人工审核；同一数值不得跨机构、等级或科目复用。
