// 声かけ(標準語)。毎回ちがうものが出るようにしている
export const DAILY = [
  '今日も一歩ずつ進めていきましょう。',
  '無理せず、できることから片づけていきましょう。',
  'いつもていねいな関わり、すてきです。',
  '深呼吸してから始めましょう。きっと大丈夫です。',
  '小さな積み重ねが、患者さんの大きな力になっています。',
  '今日のあなたの声かけが、誰かの安心になります。',
  '忙しい日こそ、休憩も大事にしてくださいね。',
  '昨日の自分より少し楽に動ける一日になりますように。',
  'やることは見える化できています。あとは順番に進めるだけです。',
  '水分補給も忘れずに。今日もよろしくお願いします。',
  'ひとつ終わるたびに、ちゃんと前に進んでいます。',
  '笑顔で過ごせる一日になりますように。',
];
export const PRAISE = [
  'おつかれさまです!ひとつ前進しました。',
  'すばらしいです。この調子です!',
  'ありがとうございます。ていねいなお仕事ですね。',
  '完了です!よくがんばりました。',
  'いいですね、着実に進んでいます。',
  'ひと区切りつきましたね。少し肩の力を抜きましょう。',
  'さすがです!頼りになります。',
  '更新できました。いつも細やかですね。',
  '一歩一歩、確実です。おつかれさまです。',
  'やりましたね!次もこの調子でいきましょう。',
];

export function dailyMessage(dateStr) {
  // 日付ごとに決まった1つ(同じ日は同じ言葉)
  let h = 0;
  for (const c of dateStr) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return DAILY[h % DAILY.length];
}
let last = -1;
export function praise() {
  let i;
  do i = Math.floor(Math.random() * PRAISE.length);
  while (i === last && PRAISE.length > 1);
  last = i;
  return PRAISE[i];
}
export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 10) return 'おはようございます';
  if (h < 17) return 'こんにちは';
  return 'おつかれさまです';
}
