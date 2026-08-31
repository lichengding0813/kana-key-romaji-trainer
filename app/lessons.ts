export type Vocab = {
  jp: string;
  kana: string;
  roma: string;
  zh: string;
  alts?: string[];
};

export type Lesson = {
  id: number;
  title: string;
  words: Vocab[];
};

export const lessons: Lesson[] = [
  {
    id: 1,
    title: "李さんは中国人です",
    words: [
      { jp: "中国人", kana: "ちゅうごくじん", roma: "chuugokujin", zh: "中国人", alts: ["tyuugokujin"] },
      { jp: "日本人", kana: "にほんじん", roma: "nihonjin", zh: "日本人" },
      { jp: "韓国人", kana: "かんこくじん", roma: "kankokujin", zh: "韩国人" },
      { jp: "学生", kana: "がくせい", roma: "gakusei", zh: "学生" },
      { jp: "先生", kana: "せんせい", roma: "sensei", zh: "老师" },
      { jp: "留学生", kana: "りゅうがくせい", roma: "ryuugakusei", zh: "留学生" },
      { jp: "教授", kana: "きょうじゅ", roma: "kyouju", zh: "教授" },
      { jp: "社員", kana: "しゃいん", roma: "shain", zh: "职员" },
      { jp: "会社員", kana: "かいしゃいん", roma: "kaishain", zh: "公司职员" },
      { jp: "店員", kana: "てんいん", roma: "tenin", zh: "店员" },
      { jp: "研修生", kana: "けんしゅうせい", roma: "kenshuusei", zh: "进修生" },
      { jp: "大学", kana: "だいがく", roma: "daigaku", zh: "大学" },
    ],
  },
  {
    id: 2,
    title: "これは本です",
    words: [
      { jp: "本", kana: "ほん", roma: "hon", zh: "书" },
      { jp: "かばん", kana: "かばん", roma: "kaban", zh: "包" },
      { jp: "ノート", kana: "のーと", roma: "no-to", zh: "笔记本" },
      { jp: "鉛筆", kana: "えんぴつ", roma: "enpitsu", zh: "铅笔" },
      { jp: "傘", kana: "かさ", roma: "kasa", zh: "伞" },
      { jp: "靴", kana: "くつ", roma: "kutsu", zh: "鞋" },
      { jp: "新聞", kana: "しんぶん", roma: "shinbun", zh: "报纸", alts: ["sinbun"] },
      { jp: "雑誌", kana: "ざっし", roma: "zasshi", zh: "杂志" },
      { jp: "辞書", kana: "じしょ", roma: "jisho", zh: "词典" },
      { jp: "カメラ", kana: "かめら", roma: "kamera", zh: "相机" },
      { jp: "パソコン", kana: "ぱそこん", roma: "pasokon", zh: "电脑" },
      { jp: "時計", kana: "とけい", roma: "tokei", zh: "钟表" },
    ],
  },
  {
    id: 3,
    title: "ここはデパートです",
    words: [
      { jp: "デパート", kana: "でぱーと", roma: "depa-to", zh: "百货商店" },
      { jp: "食堂", kana: "しょくどう", roma: "shokudou", zh: "食堂" },
      { jp: "郵便局", kana: "ゆうびんきょく", roma: "yuubinkyoku", zh: "邮局" },
      { jp: "銀行", kana: "ぎんこう", roma: "ginkou", zh: "银行" },
      { jp: "図書館", kana: "としょかん", roma: "toshokan", zh: "图书馆" },
      { jp: "マンション", kana: "まんしょん", roma: "manshon", zh: "公寓" },
      { jp: "ホテル", kana: "ほてる", roma: "hoteru", zh: "宾馆" },
      { jp: "コンビニ", kana: "こんびに", roma: "konbini", zh: "便利店" },
      { jp: "喫茶店", kana: "きっさてん", roma: "kissaten", zh: "咖啡馆" },
      { jp: "病院", kana: "びょういん", roma: "byouin", zh: "医院" },
      { jp: "本屋", kana: "ほんや", roma: "honya", zh: "书店" },
      { jp: "レストラン", kana: "れすとらん", roma: "resutoran", zh: "餐厅" },
    ],
  },
  {
    id: 4,
    title: "部屋に机といすがあります",
    words: [
      { jp: "部屋", kana: "へや", roma: "heya", zh: "房间" },
      { jp: "庭", kana: "にわ", roma: "niwa", zh: "院子" },
      { jp: "家", kana: "いえ", roma: "ie", zh: "家" },
      { jp: "居間", kana: "いま", roma: "ima", zh: "起居室" },
      { jp: "冷蔵庫", kana: "れいぞうこ", roma: "reizouko", zh: "冰箱" },
      { jp: "壁", kana: "かべ", roma: "kabe", zh: "墙壁" },
      { jp: "スイッチ", kana: "すいっち", roma: "suicchi", zh: "开关" },
      { jp: "本棚", kana: "ほんだな", roma: "hondana", zh: "书架" },
      { jp: "ベッド", kana: "べっど", roma: "beddo", zh: "床" },
      { jp: "猫", kana: "ねこ", roma: "neko", zh: "猫" },
      { jp: "犬", kana: "いぬ", roma: "inu", zh: "狗" },
      { jp: "眼鏡", kana: "めがね", roma: "megane", zh: "眼镜" },
    ],
  },
  {
    id: 5,
    title: "森さんは7時に起きます",
    words: [
      { jp: "今", kana: "いま", roma: "ima", zh: "现在" },
      { jp: "先週", kana: "せんしゅう", roma: "senshuu", zh: "上周" },
      { jp: "来週", kana: "らいしゅう", roma: "raishuu", zh: "下周" },
      { jp: "昨日", kana: "きのう", roma: "kinou", zh: "昨天" },
      { jp: "明日", kana: "あした", roma: "ashita", zh: "明天" },
      { jp: "毎日", kana: "まいにち", roma: "mainichi", zh: "每天" },
      { jp: "毎朝", kana: "まいあさ", roma: "maiasa", zh: "每天早晨" },
      { jp: "毎晩", kana: "まいばん", roma: "maiban", zh: "每天晚上" },
      { jp: "起きます", kana: "おきます", roma: "okimasu", zh: "起床" },
      { jp: "寝ます", kana: "ねます", roma: "nemasu", zh: "睡觉" },
      { jp: "働きます", kana: "はたらきます", roma: "hatarakimasu", zh: "工作" },
      { jp: "勉強します", kana: "べんきょうします", roma: "benkyoushimasu", zh: "学习" },
    ],
  },
  {
    id: 6,
    title: "吉田さんは来月中国へ行きます",
    words: [
      { jp: "来月", kana: "らいげつ", roma: "raigetsu", zh: "下个月" },
      { jp: "先月", kana: "せんげつ", roma: "sengetsu", zh: "上个月" },
      { jp: "飛行機", kana: "ひこうき", roma: "hikouki", zh: "飞机" },
      { jp: "フェリー", kana: "ふぇりー", roma: "feri-", zh: "渡轮" },
      { jp: "電車", kana: "でんしゃ", roma: "densha", zh: "电车" },
      { jp: "バス", kana: "ばす", roma: "basu", zh: "公交车" },
      { jp: "タクシー", kana: "たくしー", roma: "takushi-", zh: "出租车" },
      { jp: "美術館", kana: "びじゅつかん", roma: "bijutsukan", zh: "美术馆" },
      { jp: "友達", kana: "ともだち", roma: "tomodachi", zh: "朋友" },
      { jp: "行きます", kana: "いきます", roma: "ikimasu", zh: "去" },
      { jp: "帰ります", kana: "かえります", roma: "kaerimasu", zh: "回来／回去" },
      { jp: "来ます", kana: "きます", roma: "kimasu", zh: "来" },
    ],
  },
  {
    id: 7,
    title: "李さんは毎日コーヒーを飲みます",
    words: [
      { jp: "コーヒー", kana: "こーひー", roma: "ko-hi-", zh: "咖啡" },
      { jp: "コーラ", kana: "こーら", roma: "ko-ra", zh: "可乐" },
      { jp: "お茶", kana: "おちゃ", roma: "ocha", zh: "茶", alts: ["otya"] },
      { jp: "ワイン", kana: "わいん", roma: "wain", zh: "葡萄酒" },
      { jp: "パン", kana: "ぱん", roma: "pan", zh: "面包" },
      { jp: "ケーキ", kana: "けーき", roma: "ke-ki", zh: "蛋糕" },
      { jp: "お弁当", kana: "おべんとう", roma: "obentou", zh: "盒饭" },
      { jp: "そば", kana: "そば", roma: "soba", zh: "荞麦面" },
      { jp: "うどん", kana: "うどん", roma: "udon", zh: "乌冬面" },
      { jp: "飲みます", kana: "のみます", roma: "nomimasu", zh: "喝" },
      { jp: "食べます", kana: "たべます", roma: "tabemasu", zh: "吃" },
      { jp: "読みます", kana: "よみます", roma: "yomimasu", zh: "读" },
    ],
  },
  {
    id: 8,
    title: "李さんは日本語で手紙を書きます",
    words: [
      { jp: "プレゼント", kana: "ぷれぜんと", roma: "purezento", zh: "礼物" },
      { jp: "チケット", kana: "ちけっと", roma: "chiketto", zh: "票" },
      { jp: "パンフレット", kana: "ぱんふれっと", roma: "panfuretto", zh: "宣传册" },
      { jp: "記念品", kana: "きねんひん", roma: "kinenhin", zh: "纪念品" },
      { jp: "スケジュール", kana: "すけじゅーる", roma: "sukeju-ru", zh: "日程表" },
      { jp: "写真集", kana: "しゃしんしゅう", roma: "shashinshuu", zh: "影集" },
      { jp: "花", kana: "はな", roma: "hana", zh: "花" },
      { jp: "ボールペン", kana: "ぼーるぺん", roma: "bo-rupen", zh: "圆珠笔" },
      { jp: "宿題", kana: "しゅくだい", roma: "shukudai", zh: "作业" },
      { jp: "手紙", kana: "てがみ", roma: "tegami", zh: "信" },
      { jp: "電話番号", kana: "でんわばんごう", roma: "denwabangou", zh: "电话号码" },
      { jp: "住所", kana: "じゅうしょ", roma: "juusho", zh: "住址" },
    ],
  },
];
