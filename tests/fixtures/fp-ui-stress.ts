import { launchQualifications } from '../../packages/schema/src/qualifications.js';
import type { PublicFact } from '../../packages/schema/src/index.js';
import type { PublicQualificationView } from '../../apps/web/src/render.js';

const fp = launchQualifications.find(
  (qualification) => qualification.slug === 'fp',
);

if (!fp) throw new Error('FP qualification fixture is missing');

function fact(
  input: Pick<
    PublicFact,
    | 'providerId'
    | 'examLevelId'
    | 'examComponent'
    | 'deliveryMode'
    | 'factKey'
    | 'displayValue'
    | 'sourceUrl'
  > &
    Partial<Pick<PublicFact, 'valueType' | 'normalizedValue'>>,
): PublicFact {
  return {
    qualificationSlug: 'fp',
    providerId: input.providerId,
    examLevelId: input.examLevelId,
    examComponent: input.examComponent,
    deliveryMode: input.deliveryMode,
    examYear: 2026,
    factKey: input.factKey,
    valueType: input.valueType ?? 'text',
    normalizedValue: input.normalizedValue ?? input.displayValue,
    displayValue: input.displayValue,
    status: 'approved',
    riskLevel: 'high',
    sourceId: `source:fp:ui-stress:${input.factKey}`,
    sourceSnapshotId: `snapshot:fp:ui-stress:${input.factKey}`,
    synthetic: false,
    verifiedAt: '2026-08-13T03:45:00.000Z',
    provenanceStatus: 'verified',
    officialVerifiedAt: '2026-08-13T03:45:00.000Z',
    sourceUrl: input.sourceUrl,
  };
}

export const fpUiStressView: PublicQualificationView = {
  qualification: fp,
  status: 'verified',
  officialVerifiedAt: '2026-08-13T03:45:00.000Z',
  facts: [
    fact({
      providerId: 'jafp',
      examLevelId: 'fp:2',
      examComponent: 'academic',
      deliveryMode: 'cbt',
      factKey: 'exam_time_jafp_fp2_academic_cbt',
      displayValue: '120分',
      valueType: 'integer',
      normalizedValue: '120',
      sourceUrl: 'https://www.jafp.or.jp/exam/outline/',
    }),
    fact({
      providerId: 'jafp',
      examLevelId: 'fp:2',
      examComponent: 'practical',
      deliveryMode: 'cbt',
      factKey: 'question_count_jafp_fp2_practical_cbt',
      displayValue: '40問（多肢選択式および計算結果を入力する形式を含む）',
      sourceUrl: 'https://www.jafp.or.jp/exam/outline/',
    }),
    fact({
      providerId: 'jafp',
      examLevelId: 'fp:3',
      examComponent: 'academic',
      deliveryMode: 'cbt',
      factKey: 'passing_standard_jafp_fp3_academic_cbt',
      displayValue: '満点の60％以上（公式試験要綱に記載された基準）',
      sourceUrl: 'https://www.jafp.or.jp/exam/outline/',
    }),
    fact({
      providerId: 'kinzai',
      examLevelId: 'fp:1',
      examComponent: 'academic',
      deliveryMode: 'paper',
      factKey: 'exam_method_kinzai_fp1_academic',
      displayValue:
        '基礎編と応用編で構成される筆記試験。実施方法と当日の注意事項は公式要綱で確認してください。',
      sourceUrl: 'https://www.kinzai.or.jp/ginou/fp/1kyu/g_apply.html',
    }),
    fact({
      providerId: 'kinzai',
      examLevelId: 'fp:1',
      examComponent: 'practical',
      deliveryMode: 'paper',
      factKey: 'exam_time_kinzai_fp1_practical',
      displayValue: '面接形式・約12分（複数回の質疑を含む）',
      sourceUrl: 'https://www.kinzai.or.jp/ginou/fp/1kyu/j_apply.html',
    }),
    fact({
      providerId: 'kinzai',
      examLevelId: 'fp:2',
      examComponent: 'practical',
      deliveryMode: 'cbt',
      factKey: 'fee_kinzai_fp2_practical_cbt',
      displayValue: '受検手数料は選択する実技科目と申込区分を確認してください',
      sourceUrl: 'https://www.kinzai.or.jp/ginou/fp/2kyu/index.html',
    }),
    fact({
      providerId: 'kinzai',
      examLevelId: 'fp:2',
      examComponent: 'academic',
      deliveryMode: 'cbt',
      factKey: 'eligibility_kinzai_fp2',
      displayValue:
        '受検資格は実務経験、認定研修の修了、下位級の合格など複数の条件があり、申込前に公式要綱との照合が必要です。',
      sourceUrl: 'https://www.kinzai.or.jp/ginou/fp/sikaku.html',
    }),
    fact({
      providerId: 'jafp',
      examLevelId: 'fp:2',
      examComponent: 'academic',
      deliveryMode: 'cbt',
      factKey: 'pass_rate_jafp_fp2_academic_2026',
      displayValue:
        '公式統計の公開待ちではなく、確認済みデータのみを表示する領域',
      sourceUrl: 'https://www.jafp.or.jp/exam/',
    }),
  ],
};
