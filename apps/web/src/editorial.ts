/**
 * Site-wide non-official disclaimer (H1 compliance fix).
 * The site is an independently operated reference aggregator, NOT an official
 * exam-body site. This notice is shown in the footer, on the home page, and in
 * the operator / terms pages to avoid misleading "official" impression.
 */
export const unofficialNotice =
  '本サイトは個人が運営する非公式の参考情報サイトであり、各試験実施機関の公式サイトではありません。掲載内容は公式発表を出典として整理したものです。';

/** Clarifies that the "公式確認済み" badge means verified-against-official, not endorsement. */
export const verifiedBadgeClarification =
  '※「公式確認済み」は公式発表と照合・確認済みであることを示し、実施機関による公認・背書を意味しません。';

export type EditorialSection = {
  heading: string;
  paragraphs: readonly string[];
  items?: readonly string[];
};

export type EditorialPage = {
  title: string;
  description: string;
  eyebrow: string;
  sections: readonly EditorialSection[];
  related: readonly { href: string; label: string }[];
  compareQuery?: string;
};

const comparisonPages: Record<string, EditorialPage> = {
  'takken-vs-gyoseishoshi': {
    title: '宅建と行政書士の違い',
    description:
      '宅地建物取引士と行政書士を、学ぶ分野や試験情報の確認方法から整理します。',
    eyebrow: '比較ガイド',
    sections: [
      {
        heading: '比較するときの考え方',
        paragraphs: [
          '資格を選ぶときは、名称だけで優劣を決めず、扱う業務分野、学びたい内容、受験に必要な準備を分けて確認することが大切です。',
          '宅建と行政書士はどちらも法律に関わる資格ですが、公式情報を読むときは、それぞれの試験案内で受験資格、申込み方法、試験方式を個別に確認してください。',
        ],
      },
      {
        heading: '確認したい項目',
        paragraphs: [
          '比較表では、同じ年度・同じ確認時点の公式情報を横並びにして確認します。',
        ],
        items: [
          '資格取得後に関心がある分野と、学習したい法令・実務のテーマ',
          '申込みの条件、手続きの方法、必要な書類',
          '試験方式、試験内容、受験料などの公式案内',
          '現在年度の日程と、学習計画に必要な締切',
        ],
      },
      {
        heading: '数字の読み方',
        paragraphs: [
          '合格率や受験者数は年度や集計方法によって変わります。単一の数値だけを理由に、どちらが簡単か、どちらが自分に向くかを決めることはできません。',
          '表示される日程、費用、条件は更新されることがあるため、出典と公式情報確認日をあわせて確認してください。',
        ],
      },
    ],
    related: [
      { href: '/shikaku/takken/', label: '宅建の概要を見る' },
      { href: '/shikaku/gyoseishoshi/', label: '行政書士の概要を見る' },
      { href: '/schedule/', label: '試験日程を見る' },
    ],
    compareQuery: 'takken,gyoseishoshi',
  },
  'it-passport-vs-fundamental-it-engineer': {
    title: 'ITパスポートと基本情報技術者の違い',
    description:
      'ITパスポートと基本情報技術者を、学習内容と公式試験情報の確認項目から整理します。',
    eyebrow: '比較ガイド',
    sections: [
      {
        heading: '比較するときの考え方',
        paragraphs: [
          'IT分野の資格を選ぶときは、資格名の印象だけでなく、公式に示される試験内容、実施方式、申込み案内を確認します。',
          'CBT方式の試験では、受験可能な時期や会場の案内が更新されることがあります。画面上の情報だけでなく、出典の公式ページも確認してください。',
        ],
      },
      {
        heading: '確認したい項目',
        paragraphs: [
          '比較表は、現在公開できる公式確認済みの情報だけを表示します。未確認の項目は推測で補いません。',
        ],
        items: [
          '学びたい範囲と、公式に示される試験内容・出題形式',
          '受験の申込み方法、利用できる実施方式、確認が必要な手続き',
          '試験時間、問題数、合格基準などの試験案内',
          '受験予定に合わせた申込み・試験日の確認',
        ],
      },
      {
        heading: '比較結果の使い方',
        paragraphs: [
          '比較表の空欄は、情報が不要という意味ではありません。現在公開できる公式確認済みの事実がないことを示します。',
          '制度や試験の実施案内は更新される可能性があるため、最終的な申込み前には公式サイトの案内を確認してください。',
        ],
      },
    ],
    related: [
      { href: '/shikaku/it-passport/', label: 'ITパスポートの概要を見る' },
      {
        href: '/shikaku/fundamental-it-engineer/',
        label: '基本情報技術者の概要を見る',
      },
      { href: '/schedule/', label: '試験日程を見る' },
    ],
    compareQuery: 'it-passport,fundamental-it-engineer',
  },
  'bookkeeping-vs-fp': {
    title: '日商簿記とFP技能検定の違い',
    description:
      '日商簿記とFP技能検定を、級・実施方式を区別して確認するための比較ガイドです。',
    eyebrow: '比較ガイド',
    sections: [
      {
        heading: '比較するときの考え方',
        paragraphs: [
          '日商簿記とFP技能検定は、級、科目、実施方式によって確認すべき公式情報が異なります。資格全体を一つの数字や日程にまとめず、希望する級や区分を先に決めて確認してください。',
          '特に複数の実施機関や方式がある場合は、同じ名称の試験でも申込み方法、費用、試験内容が一致するとは限りません。',
        ],
      },
      {
        heading: '確認したい項目',
        paragraphs: [
          '比較表では、資格名のほかに、表示される級、実施機関、科目、実施方式を確認します。',
        ],
        items: [
          '目標にする級・科目と、公式に案内される受験資格',
          '統一試験、ネット試験、CBTなどの実施方式',
          '受験料、試験時間、問題形式、合格基準の適用範囲',
          '申込み締切と試験日を含む年度別の予定',
        ],
      },
      {
        heading: '情報を混ぜないために',
        paragraphs: [
          '比較するときは、別の級、別の科目、別の実施機関の値を同じ条件として扱わないことが重要です。',
          '本サイトの比較表では、確認できた区分を併記します。表示の前提が異なる値は、単純に並べ替えたり、難易度の順位に置き換えたりしません。',
        ],
      },
    ],
    related: [
      { href: '/shikaku/bookkeeping/', label: '日商簿記の概要を見る' },
      { href: '/shikaku/fp/', label: 'FP技能検定の概要を見る' },
      { href: '/schedule/', label: '試験日程を見る' },
    ],
    compareQuery: 'bookkeeping,fp',
  },
};

const guidePages: Record<string, EditorialPage> = {
  'official-information-check': {
    title: '資格試験情報の正しい確認方法',
    description:
      '資格試験の公式情報を確認するときに、年度、出典、更新状況を見分けるためのガイドです。',
    eyebrow: '受験準備ガイド',
    sections: [
      {
        heading: 'まず年度を確認する',
        paragraphs: [
          '試験日、申込み期間、受験料、受験資格は年度によって変わることがあります。ページを読む前に、対象年度と情報状態を確認してください。',
          '前年度の情報を参考にするときは、現在年度の確定情報として扱わないことが大切です。',
        ],
      },
      {
        heading: '公式ソースを見る',
        paragraphs: [
          '重要な日付や条件は、資格の実施機関・官公庁などの公式ソースで確認します。',
        ],
        items: [
          '資格名、年度、対象の級や科目が一致しているか',
          '申込み、試験、合格発表など、確認したい項目を直接扱う案内か',
          '訂正、変更、延期、休止などの新しい案内がないか',
        ],
      },
      {
        heading: '確認日と更新履歴を使う',
        paragraphs: [
          '公式情報確認日は、出典を最後に確認できた時点を示します。ページ更新日と同じ意味ではありません。',
          '重要な変更は更新情報で確認し、申込みや受験の直前には公式サイトもあわせて確認してください。',
        ],
      },
    ],
    related: [
      { href: '/shikaku/', label: '資格を探す' },
      { href: '/updates/', label: '更新情報を見る' },
      { href: '/schedule/', label: '試験日程を見る' },
    ],
  },
  'annual-schedule-planning': {
    title: '資格試験の年間スケジュールの立て方',
    description:
      '申込みから試験、合格発表までを公式情報に基づいて整理するためのガイドです。',
    eyebrow: '受験準備ガイド',
    sections: [
      {
        heading: '予定は公式の日付から作る',
        paragraphs: [
          '年間の計画は、確認済みの申込開始、申込締切、試験日、合格発表を起点にします。発表待ちの項目には仮の日付を置かず、確認が必要な状態として残します。',
          '複数の資格を検討する場合も、年度と実施区分を分けて日程を確認してください。',
        ],
      },
      {
        heading: '申込み前の予定を分ける',
        paragraphs: [
          '試験日だけではなく、手続きに必要な期間を別に管理すると確認漏れを減らせます。',
        ],
        items: [
          '公式案内の公開と、受験資格・必要書類の確認',
          '申込み開始、締切、支払いなどの手続き',
          '試験日、会場や受験方法に関する案内',
          '合格発表後に確認したい公式手続き',
        ],
      },
      {
        heading: '変更に備える',
        paragraphs: [
          '日程が変更・訂正される場合があります。カレンダーに追加した後も、情報状態と公式ソースを定期的に確認してください。',
          '本サイトのICSは確認済みの日付だけを出力します。未確認の予定を自動で補うことはありません。',
        ],
      },
    ],
    related: [
      { href: '/schedule/', label: '試験日程を見る' },
      { href: '/compare/', label: '資格を比較する' },
      { href: '/updates/', label: '更新情報を見る' },
    ],
  },
  'application-checklist': {
    title: '受験申込み前の確認チェックリスト',
    description:
      '資格試験へ申込む前に、公式案内で確認したい項目を整理したチェックリストです。',
    eyebrow: '受験準備ガイド',
    sections: [
      {
        heading: '対象の試験を特定する',
        paragraphs: [
          '同じ資格でも、級、科目、実施機関、試験方式が異なる場合があります。申込み前に対象を明確にしてください。',
        ],
        items: [
          '対象年度、級、科目、実施方式',
          '受験資格と、免除・特例に関する公式案内',
          '申込み方法と、利用する公式の申込み窓口',
        ],
      },
      {
        heading: '期限と費用を確認する',
        paragraphs: [
          '申込みの受付期間、締切時刻、支払い方法は、対象の公式案内で確認します。別年度や別区分の案内を混ぜないよう注意してください。',
        ],
      },
      {
        heading: '申込み後も公式案内を確認する',
        paragraphs: [
          '申込み後は、受験票、会場、当日の持ち物などの案内が追加される場合があります。保存したページだけに頼らず、公式の更新も確認してください。',
          '不明な点は、推測せず実施機関の公式窓口で確認してください。',
        ],
      },
    ],
    related: [
      { href: '/shikaku/', label: '資格を探す' },
      { href: '/schedule/', label: '試験日程を見る' },
      { href: '/updates/', label: '更新情報を見る' },
    ],
  },
  'how-to-read-pass-rates': {
    title: '合格率データを見るときの注意点',
    description:
      '資格試験の合格率を、年度・母数・公式統計の口径とあわせて読むためのガイドです。',
    eyebrow: 'データの見方',
    sections: [
      {
        heading: '年度と集計の対象をそろえる',
        paragraphs: [
          '合格率を比較するときは、対象年度、級、科目、実施方式が一致しているかを確認します。異なる条件の数値をそのまま並べても、同じ意味にはなりません。',
          '公式が示す申込者数、実受験者数、合格者数などの定義も、あわせて確認してください。',
        ],
      },
      {
        heading: '個人の結果を予測する数値ではない',
        paragraphs: [
          '過去の合格率は、その年度・集計対象における実績です。個人の合格可能性や、資格の難しさを単独で示すものではありません。',
          '学習経験、選択する級・科目、試験方式などを考慮し、公式の試験内容とあわせて確認してください。',
        ],
      },
      {
        heading: '出典をたどる',
        paragraphs: [
          '本サイトでは、公開する統計値に年度と出典を添えます。数値の意味が不明なときは、公式の統計資料や試験案内を確認してください。',
        ],
      },
    ],
    related: [
      { href: '/shikaku/', label: '資格を探す' },
      { href: '/compare/', label: '資格を比較する' },
      { href: '/updates/', label: '更新情報を見る' },
    ],
  },
};

export const correctionsIssueUrl =
  'https://github.com/roykim26/jp_qualification_media/issues/new';

const aboutPages: Record<string, EditorialPage> = {
  sources: {
    title: '情報源について',
    description:
      '掲載する資格情報の出典、保存記録、公開までの確認手順について説明します。',
    eyebrow: '運営・方針',
    sections: [
      {
        heading: '情報源の範囲',
        paragraphs: [
          '本サイトは、試験実施機関や官公庁が公開する公式ページを情報源として登録しています。各資格ページの「公式ソースと更新について」に出典を掲載し、確認できるものは公式URLから直接たどれます。',
        ],
        items: [
          '試験日程、申込期間、合格発表',
          '受験資格、受験料、支払期限',
          '試験方式、試験科目、出題形式、合格基準',
          '合格率、申込者数、受験者数、合格者数などの統計',
        ],
      },
      {
        heading: '公開までの流れ',
        paragraphs: [
          '公式ページの内容を保存記録（スナップショット）として残し、差分を確認したうえで、承認された事実だけを公開します。承認前の情報や、出典を確認できない情報は表示しません。',
        ],
      },
      {
        heading: '掲載しない情報',
        paragraphs: [
          '公式発表前の日付、料金、制度情報は掲載しません。前年度の値を現在年度に流用したり、空欄を推測値で埋めたりすることもありません。',
        ],
      },
    ],
    related: [
      { href: '/shikaku/', label: '資格を探す' },
      { href: '/about/editorial-policy/', label: '編集方針・AI方針' },
      { href: '/updates/', label: '更新情報を見る' },
    ],
  },
  'editorial-policy': {
    title: '編集方針・AI方針',
    description:
      '公式確認済み情報だけを掲載するための編集方針と、生成AIの扱いについて説明します。',
    eyebrow: '運営・方針',
    sections: [
      {
        heading: '編集の基本',
        paragraphs: [
          '掲載する情報は、公式ソースの保存記録と承認記録を持つ事実に限ります。読みやすさより、どの年度・どの区分の情報かを取り違えないことを優先します。',
        ],
        items: [
          '公式ソースの保存記録と承認記録がある事実だけを公開する',
          '年度、級、実施区分、実施機関を分けて表示する',
          '確認できない値は空欄のままにし、推測で補完しない',
          '変更や訂正は更新情報に記録し、変更前後を確認できるようにする',
        ],
      },
      {
        heading: '生成AIの扱い',
        paragraphs: [
          '生成AIの出力を、そのまま公開事実として掲載することはありません。公開する日付、料金、制度情報は、公式ソースとの照合と承認を経たものに限ります。',
        ],
      },
      {
        heading: '表示の責任',
        paragraphs: [
          '掲載内容に誤りを見つけた場合は、訂正のご連絡からお知らせください。確認のうえ、必要に応じてページと更新情報を訂正します。',
        ],
      },
    ],
    related: [
      { href: '/about/sources/', label: '情報源について' },
      { href: '/about/corrections/', label: '訂正のご連絡' },
      { href: '/updates/', label: '更新情報を見る' },
    ],
  },
  corrections: {
    title: '訂正のご連絡',
    description:
      '掲載情報の誤り、古い情報、表示の不具合を報告する方法について説明します。',
    eyebrow: '運営・方針',
    sections: [
      {
        heading: '受け付ける内容',
        paragraphs: [
          '掲載内容の確認や訂正のために、次のようなご連絡を受け付けています。',
        ],
        items: [
          '事実の誤りや、公式発表より古い情報',
          '公式ソースとの不一致',
          'リンク切れや表示の不具合',
          '掲載内容についてのご質問',
        ],
      },
      {
        heading: 'ご連絡時に添えてほしい情報',
        paragraphs: [
          '対象を特定できるよう、わかる範囲で次の情報を添えてください。個人情報や受験票番号など、公開不要な情報は記載しないでください。',
        ],
        items: [
          '対象ページのURLと、該当する項目',
          '現在の表示と、正しいと考えられる内容',
          '根拠となる公式URL',
          '確認した時点（わかる範囲で）',
        ],
      },
      {
        heading: '対応の流れ',
        paragraphs: [
          'ご連絡を受けた内容は、公式ソースを確認したうえで、必要に応じてページと更新情報を訂正します。内容によっては個別の回答を差し上げられない場合があります。受験や申込みに関する最終判断は、試験実施機関の公式案内をご確認ください。',
        ],
      },
    ],
    related: [
      { href: correctionsIssueUrl, label: 'GitHub Issues で訂正を報告する' },
      { href: '/updates/', label: '更新情報を見る' },
      { href: '/about/sources/', label: '情報源について' },
    ],
  },
  operator: {
    title: '運営者情報',
    description:
      '本サイトの運営体制、情報の取り扱い、開示請求への対応について説明します。',
    eyebrow: '運営・方針',
    sections: [
      {
        heading: '運営体制',
        paragraphs: [
          '本サイトは、個人開発者による小規模な運営で公開しています。特定の試験実施機関、予備校、企業から独立して運営しており、掲載内容の判断は本サイトの編集方針に基づきます。',
          unofficialNotice,
          '運営者の氏名、所在地、連絡先などの詳細は、下記の窓口から開示をご請求ください。請求の目的を確認したうえで、法令に基づき対応します。',
        ],
      },
      {
        heading: '運営の目的',
        paragraphs: [
          '資格試験の公式情報は、実施機関ごとに形式や更新時期が異なります。本サイトは、年度・級・実施区分をそろえて読み比べられる形に整理し、申込みや学習計画の確認を助けることを目的としています。',
        ],
        items: [
          '公式ソースの保存記録と承認記録がある情報だけを掲載する',
          '確認できない値は空欄のままにし、推測で補完しない',
          '変更や訂正は更新情報に記録する',
        ],
      },
      {
        heading: '開示・訂正のご請求',
        paragraphs: [
          '掲載内容の訂正、運営者情報の開示、個人情報の開示・訂正・削除のご請求は、訂正のご連絡からお送りください。対象ページのURLとご請求の内容を添えていただけると確認が進みます。',
        ],
      },
    ],
    related: [
      { href: '/about/contact/', label: 'お問い合わせ' },
      { href: '/about/privacy/', label: 'プライバシーポリシー' },
      { href: '/about/corrections/', label: '訂正のご連絡' },
    ],
  },
  privacy: {
    title: 'プライバシーポリシー',
    description:
      '本サイトで取得する情報、利用目的、第三者配信サービスとCookieの扱いについて説明します。',
    eyebrow: '運営・方針',
    sections: [
      {
        heading: '取得する情報',
        paragraphs: [
          '本サイトは、会員登録や氏名・住所の入力を求めません。ページの表示にともない、サーバーが次の情報を自動的に受け取る場合があります。',
        ],
        items: [
          'IPアドレス、ブラウザの種類、リクエストされたURL、アクセス日時',
          'Cookie およびこれに類する識別子',
          'お問い合わせや訂正のご連絡で任意に記載された内容',
        ],
      },
      {
        heading: '利用目的',
        paragraphs: [
          '取得した情報は、サイトの提供と維持、不正アクセスの防止、表示不具合の調査、掲載内容の改善のために利用します。ご連絡でお預かりした内容は、お問い合わせへの対応と記録の確認にのみ利用します。',
        ],
      },
      {
        heading: 'アクセス解析',
        paragraphs: [
          '本サイトでは、利用状況を把握するために Google Analytics 4 を利用する場合があります。Google Analytics は Cookie を使用し、個人を特定しない形でアクセス情報を収集します。収集される情報とその扱いは、Google のプライバシーポリシーに従います。',
          'ブラウザの設定で Cookie を無効にすると、解析の対象から外れる場合があります。',
        ],
      },
      {
        heading: '第三者配信の広告',
        paragraphs: [
          '本サイトでは、第三者配信の広告サービスを利用する場合があります。広告配信事業者は、Cookie を使用して、利用者の興味・関心に応じた広告を表示することがあります。',
          'パーソナライズ広告は、Google 広告設定などの各事業者が提供するオプトアウトの手段で無効にできます。広告の取り扱いの詳細は、広告・PR方針をご確認ください。',
        ],
      },
      {
        heading: '第三者提供と安全管理',
        paragraphs: [
          '法令に基づく場合、または本人の同意がある場合を除き、取得した情報を第三者に提供しません。取得した情報への不正アクセス、紛失、改ざんを防ぐため、取り扱う範囲を必要最小限に限定します。',
        ],
      },
      {
        heading: '開示・訂正・削除',
        paragraphs: [
          'ご本人からの請求により、保有する個人情報の開示、訂正、利用停止、削除に応じます。訂正のご連絡からご請求ください。ご本人であることを確認できない場合は、対応をお断りすることがあります。',
        ],
      },
      {
        heading: '改定',
        paragraphs: [
          '本方針を変更する場合は、このページを更新し、重要な変更は更新情報でもお知らせします。',
        ],
      },
    ],
    related: [
      { href: '/about/operator/', label: '運営者情報' },
      { href: '/about/terms/', label: '利用規約' },
      { href: '/about/contact/', label: 'お問い合わせ' },
    ],
  },
  terms: {
    title: '利用規約',
    description:
      '本サイトの利用条件、掲載情報の扱い、禁止事項について説明します。',
    eyebrow: '運営・方針',
    sections: [
      {
        heading: '適用',
        paragraphs: [
          '本規約は、本サイトの閲覧および利用に適用されます。本サイトを利用した場合、本規約に同意したものとみなします。',
        ],
      },
      {
        heading: '掲載情報の性質',
        paragraphs: [
          '本サイトは、試験実施機関や官公庁が公開する情報を整理して掲載する参考情報です。試験の申込み、受験、制度の適用に関する最終的な判断は、必ず実施機関の公式案内を確認してください。',
          unofficialNotice,
          '掲載する日付、費用、受験資格などは、確認時点の情報です。その後に変更、訂正、延期される場合があります。',
        ],
      },
      {
        heading: '免責',
        paragraphs: [
          '本サイトは、掲載情報の完全性、正確性、最新性を保証しません。掲載情報の利用によって生じた損害について、故意または重大な過失がある場合を除き、責任を負いません。',
          '本サイトからリンクする外部サイトの内容は、各サイトの運営者が管理します。外部サイトの内容について責任を負いません。',
        ],
      },
      {
        heading: '禁止事項',
        paragraphs: ['本サイトの利用にあたり、次の行為を禁止します。'],
        items: [
          '本サイトのサーバーやネットワークに過度な負荷をかける行為',
          '本サイトを装ったなりすまし、または誤解を招く形での転載',
          '法令に違反する行為、または公序良俗に反する行為',
          '第三者に不利益を与える目的での利用',
        ],
      },
      {
        heading: '知的財産',
        paragraphs: [
          '本サイトの文章、構成、デザインなどの著作物は、本サイトの運営者に帰属します。引用元として公式情報を掲載する場合、その権利は各情報源に帰属します。',
          '引用や転載を希望する場合は、出典とリンクを明示し、訂正のご連絡からご一報ください。',
        ],
      },
      {
        heading: 'サービスの変更・中断',
        paragraphs: [
          '本サイトは、予告なく内容の変更、公開の停止、運営の終了を行う場合があります。これによって生じた損害について責任を負いません。',
        ],
      },
      {
        heading: '準拠法',
        paragraphs: [
          '本規約は日本法に準拠します。本サイトに関して争いが生じた場合は、運営者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。',
        ],
      },
    ],
    related: [
      { href: '/about/privacy/', label: 'プライバシーポリシー' },
      { href: '/about/advertising-policy/', label: '広告・PR方針' },
      { href: '/about/contact/', label: 'お問い合わせ' },
    ],
  },
  'advertising-policy': {
    title: '広告・PR方針',
    description:
      '本サイトの広告の扱いと、掲載内容の編集の独立性について説明します。',
    eyebrow: '運営・方針',
    sections: [
      {
        heading: '広告の表示',
        paragraphs: [
          '本サイトは、運営費の一部を広告収入でまかなう場合があります。広告は、記事本文や公式情報の表示と区別できる位置に掲載し、広告であることを明示します。',
        ],
      },
      {
        heading: '編集の独立性',
        paragraphs: [
          '広告主は、掲載する資格の選定、事実の内容、掲載順位、比較結果に影響しません。広告の有無によって、掲載情報の扱いを変えることはありません。',
          '特定の資格やサービスを有利に扱う代わりに報酬を受け取る場合は、その旨を該当ページに明示します。',
        ],
      },
      {
        heading: '第三者配信の広告',
        paragraphs: [
          '本サイトでは、Google AdSense などの第三者配信の広告サービスを利用する場合があります。これらの事業者は Cookie を使用し、利用者の興味・関心に応じた広告を表示することがあります。',
          'パーソナライズ広告の無効化や Cookie の扱いは、プライバシーポリシーと各事業者の案内をご確認ください。',
        ],
      },
      {
        heading: 'アフィリエイトプログラム',
        paragraphs: [
          '今後、書籍や講座などのアフィリエイトプログラムを利用する場合は、該当するリンクの近くに広告であることを明示します。',
        ],
      },
    ],
    related: [
      { href: '/about/privacy/', label: 'プライバシーポリシー' },
      { href: '/about/editorial-policy/', label: '編集方針・AI方針' },
      { href: '/about/contact/', label: 'お問い合わせ' },
    ],
  },
  'ai-policy': {
    title: 'AI利用方針',
    description:
      '本サイトで生成AIを利用する範囲と、公開前の確認手順について説明します。',
    eyebrow: '運営・方針',
    sections: [
      {
        heading: '基本方針',
        paragraphs: [
          '本サイトは、文章の下書きや整理、表示の確認などに生成AIを利用する場合があります。ただし、日付、費用、受験資格、合格率などの事実情報は、生成AIの出力をそのまま公開しません。',
        ],
      },
      {
        heading: '公開までの確認',
        paragraphs: [
          '公開する事実は、公式ソースの保存記録と、承認の記録を持つものに限ります。生成AIが作成した文章であっても、公開前に内容を確認し、事実と一致しない表現は修正します。',
        ],
        items: [
          '公式ソースと照合できる事実だけを掲載する',
          '年度、級、実施区分の取り違えを確認する',
          '確認できない値は空欄のままにする',
          '誤りを見つけた場合は、更新情報に記録して訂正する',
        ],
      },
      {
        heading: '著作権と権利',
        paragraphs: [
          '生成AIを利用する場合も、第三者の著作権、商標権、肖像権を尊重します。公式資料の文章をそのまま複製するのではなく、必要に応じて出典を明示します。',
        ],
      },
      {
        heading: '誤りのご連絡',
        paragraphs: [
          'AIの利用に起因する誤りを見つけた場合は、訂正のご連絡からお知らせください。確認のうえ、ページと更新情報を訂正します。',
        ],
      },
    ],
    related: [
      { href: '/about/editorial-policy/', label: '編集方針・AI方針' },
      { href: '/about/sources/', label: '情報源について' },
      { href: '/about/privacy/', label: 'プライバシーポリシー' },
    ],
  },
  contact: {
    title: 'お問い合わせ',
    description:
      '本サイトへのご連絡方法と、お問い合わせの前に確認していただきたい事項をまとめています。',
    eyebrow: '運営・方針',
    sections: [
      {
        heading: 'ご連絡方法',
        paragraphs: [
          '本サイトへのご連絡は、GitHub の Issue で受け付けています。下のリンクから新しい Issue を作成し、対象ページのURLとご用件を記載してください。',
        ],
        items: [
          '掲載内容の誤り、古い情報、公式ソースとの不一致',
          'リンク切れや表示の不具合',
          '運営者情報の開示請求',
          '個人情報の開示・訂正・削除の請求',
          '引用・転載のご相談',
        ],
      },
      {
        heading: '記載しないでほしい情報',
        paragraphs: [
          'Issue は公開されます。氏名、住所、電話番号、メールアドレス、受験票番号、その他個人を特定できる情報は記載しないでください。個別の事情がある場合は、その旨だけを記載していただければ、こちらから連絡方法をご案内します。',
        ],
      },
      {
        heading: '回答について',
        paragraphs: [
          '内容を確認したうえで、必要に応じてページと更新情報を訂正します。すべてのご連絡に個別の回答を差し上げられるとは限りません。',
          '受験資格、申込み手続き、試験日程の最終確認は、試験実施機関の公式窓口にお問い合わせください。本サイトでは個別の受験相談には応じられません。',
        ],
      },
    ],
    related: [
      { href: correctionsIssueUrl, label: 'GitHub Issues で連絡する' },
      { href: '/about/operator/', label: '運営者情報' },
      { href: '/about/corrections/', label: '訂正のご連絡' },
    ],
  },
};

export function editorialComparisonPage(
  slug: string,
): EditorialPage | undefined {
  return comparisonPages[slug];
}

export function editorialGuidePage(slug: string): EditorialPage | undefined {
  return guidePages[slug];
}

export function editorialAboutPage(slug: string): EditorialPage | undefined {
  return aboutPages[slug];
}

export const editorialComparisonSlugs = Object.keys(comparisonPages);
export const editorialGuideSlugs = Object.keys(guidePages);
export const editorialAboutSlugs = Object.keys(aboutPages);

export function editorialGuideEntries(): readonly {
  slug: string;
  page: EditorialPage;
}[] {
  return Object.entries(guidePages).map(([slug, page]) => ({ slug, page }));
}
