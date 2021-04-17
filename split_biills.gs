// @ts-nocheck
const CHANEL_ACCESS_TOKEN = "ACCESS_TOKEN";
const SPREADSHEET = SpreadsheetApp.openById("SPREADSHEET_ID");
const MONEY_SHEET = SPREADSHEET.getSheetByName("calc_money"); 
const USER_SHEET = SPREADSHEET.getSheetByName("user_id");
const DEBUG_SHEET = SPREADSHEET.getSheetByName("debug");
const USERID_COLUMN = 1; //1列目がユーザ情報格納列
const STATUS_COLUMN = 3; //3行目がステータス格納列
const TABIMEI_COLUMN = 2; //2行目の旅名格納列
const TABIMEI_UPPER_LIMIT = 20; //格納できる旅の種類の数
const STATUS_ROW = 1; //MONEYSHEETのステータスをつかさどる行
const HOLD_TABIMEI_DAYS = 2; //旅名を残しておく期間
const UPPER_PRICE = 100000000; //大きすぎる金額はエラーにするための上限金額

// ボットにメッセージ送信/フォロー/アンフォローした時の処理
function doPost(e) {
  var events = JSON.parse(e.postData.contents).events;
  events.forEach(function(event) {
    if(event.type == "message") {
      reply(event);
    } else if(event.type == "follow") {
      follow(event);
    } else if(event.type == "unfollow") {
      unFollow(event);
    }
 });
}

function reply(e) {
  //本文
  if (!is_text(e)){
    send_message("テキスト以外は受付できません…", e);
    return;
  }
  var tmp;
  var sentence; 
  var last_row = 1
  var user_status;
  var message_chk_flg = 0;
  switch(chk_user_status(e)){
    case "":
      send_message("初めまして！このbotは旅の割り勘を手助けするよ！\n" + 
                    "まずはこの旅の名前を決めて入力してね！\n" +
                    "複数人で金額を入力するときは、全員同じ旅名にしてね！" +
                    "その後、金額を積み上げて合計金額を表示するよ！\n\n" + 
                    "「割り勘」と入力したら、今までその旅名で入力した金額の割り勘額を表示するよ！", e);
      enter_user_status("初回表示終了", e);
      break;
    case "初回表示終了":
      var tmp = conv_full_to_half(e.message.text);
      tmp = conv_kana_half_full(tmp);
      exe_verrification("旅名は\n" + 
                         tmp + "\n", e);
      enter_user_tabimei(tmp, e);
      enter_user_status("旅名確認中",e);
      break;
    case "旅名確認中":
      if(e.message.text == "うん"){
        send_message("旅名を確定させました！\n" + 
                      "以降、金額を入力してくれるとをそれを記録していきます！",e);
        if(get_tabimei_column(e) == 0){
          over_write_tabimei(e);
        }
        enter_user_status("通過", e);
      }else if(e.message.text == "やめとく"){
        send_message("ではもう別の旅名を入力してね。",e);
        enter_user_status("初回表示終了", e);
      }else{
        send_message("「うん」か「やめとく」で返事しやがれーーーッ！！！", e);
      }
    case "テスト":
      break;     
    case "割り勘人数待ち":
      tmp = parseInt(conv_full_to_half(e.message.text));
      if (isNaN(tmp)){
        sentence = "割り勘人数を入力してください！";
      }else if(!chk_more_1(tmp)){
        sentence = "人数は1以上の整数を入力してください！";
      }else{
        sentence = tmp + "人で割ると、全体金額の一人当たりの金額は、\n" + 
                   Math.ceil(get_whole_sum(e) / tmp) + "円で、\n" + 
                   "あなたが入力した金額の合計の一人当たりの金額は、\n" + 
                   Math.ceil(get_user_sum(e) / tmp) + "円です！";
        enter_user_status("通過", e);      
      }
      send_message(sentence, e);
      break;
    case "リセット確認待ち":
      if(e.message.text == "うん"){
        send_message("すべてリセットされました。\n" + 
                     "何か入力すると新たに旅名を設定することができます！",e);
        reset_money(get_tabimei_column(e));
        enter_user_status("", e);
      }else if(e.message.text == "やめとく"){
        send_message("リセットはキャンセルされました",e);
        enter_user_status("通過", e);
      }else{
        send_message("「うん」か「やめとく」で返事しやがれーーーッ！！！", e);
      }
    default:
      message_chk_flg = 1;
      break;
  }
  if (message_chk_flg == 1){
      switch(e.message.text){
        case "リセット":
          exe_verrification("現在設定している旅名情報、\n" + 
                            "積み上げた金額の情報、\n" + 
                            "すべてリセットします。", e);
          enter_user_status("リセット確認待ち", e);
          break;
        case "割り勘":
          if (get_whole_sum(e) <= 0){
            send_message("合計値が0の時は割り勘できません", e);
            break;
          }else{
            send_message("割り勘ですね！人数を入力してください！", e);
            enter_user_status("割り勘人数待ち",e);
            break;
          }
        case "userID":
          user_status = chk_user_status(e);
          send_message("あなたのユーザIDは\n" + 
                        e.source.userId + "\n" + 
                        "で、" + user_status + "に格納されてます",e);
        case "旅名変更":
          send_message("別の旅名を設定するのですね！\n" + 
                       "新しい旅名を入力してください！", e);
          enter_user_status("初回表示終了",e);
          break;
        default:
          tmp = parseInt(conv_full_to_half(e.message.text));
          
          if (isNaN(tmp)){
            sentence = "金額を入力してください！";
          }else if (!chk_amount_money(tmp)){
            sentence = "入力された金額が大きすぎます。";
          }else{
            last_row = MONEY_SHEET.getRange(MONEY_SHEET.getMaxRows(), get_tabimei_column(e)).getNextDataCell(SpreadsheetApp.Direction.UP).getRow();
            MONEY_SHEET.getRange(last_row + 1, get_tabimei_column(e)).setValue(tmp);
            MONEY_SHEET.getRange(last_row + 1, get_tabimei_column(e) + 1).setValue(e.source.userId);
            //入力した日付を格納
            MONEY_SHEET.getRange(STATUS_ROW, get_tabimei_column(e) + 1).setValue(dayjs.dayjs().format());
            var user_sum = get_user_sum(e);
            var whole_sum = get_whole_sum(e);
            sentence = tmp + "円、受け付けました！\n" + 
                       "現在の合計金額は" + whole_sum + "円で、\n" + 
                       "あなたが入力した合計金額は、" + user_sum + "円です！";

          }
          send_message(sentence, e);
          break;
      }
  }
}


//ユーザの内容がテキストであるかどうかチェック
function is_text(e){
  if (e.message.type == "text"){
    return true;
  }else{
    return false;
  }
}

//与えられた数値が一定金額がを超えていないかどうかを確認する関数
//問題なければTrue, そうでなければFalseを返す
function chk_amount_money(price){
  try{
    if (Math.abs(price) > UPPER_PRICE){
      return false;
    }else {
      return true;
    }
  } catch(error){
    write_debug("chk_amout_moneyでエラーが発生しました。：" + error.message);
    return false;
  }
}

//与えられた数値が１以上かどうかチェックする
//1以上ならTrue 1より小さいならFalseを返す
function chk_more_1(amount){
  try{
     if (parseInt(amount) < 1){
       return false;
     }else{
       return true;
     }
  } catch(error){
    write_debug("chk_more_1でエラーが発生しました。：" + error.message);
    return false;
  }
}
//与えられたユーザが所属している旅名の金額の合計値を返す
function get_whole_sum(e){
  try{
    var last_row = MONEY_SHEET.getRange(MONEY_SHEET.getMaxRows(), get_tabimei_column(e)).getNextDataCell(SpreadsheetApp.Direction.UP).getRow(); 
    if (last_row == 1) {
      return 0;
    }else{
      var user_sum = MONEY_SHEET.getRange(2, get_tabimei_column(e), last_row - 1, 1).getValues().reduce(function(prev, current){
        return  isNaN(parseInt(current[0])) ? parseInt(prev) : parseInt(prev) + parseInt(current[0]);
      }, 0);
      return user_sum;
    }
  }
  catch(error){
    write_debug("get_whole_sumでエラーが発生しました" + error.message);
  }
}

//与えられた文字列をデバッグ列に追加する
function write_debug(sentence){
  var last_row = DEBUG_SHEET.getRange(DEBUG_SHEET.getMaxRows() , 1).getNextDataCell(SpreadsheetApp.Direction.UP).getRow();
  DEBUG_SHEET.getRange(last_row + 1 , 1).setValue(sentence);
  DEBUG_SHEET.getRange(last_row + 1 , 2).setValue(dayjs.dayjs().add(13, 'h').format("YYYY/MM/DD HH:mm:ss"));
}

//与えられたユーザが所属している旅名でユーザが入力した金額の合計値を返す
function get_user_sum(e){
  try{
    var last_row = MONEY_SHEET.getRange(MONEY_SHEET.getMaxRows(), get_tabimei_column(e)).getNextDataCell(SpreadsheetApp.Direction.UP).getRow(); 
    if (last_row == 1){
      return 0;
    }
    else{
      var user_sum = MONEY_SHEET.getRange(2, get_tabimei_column(e), last_row - 1, 2).getValues().reduce(function(prev, current){
        if(current[1] == e.source.userId && !isNaN(parseInt(current[0]))){
          return parseInt(prev) + parseInt(current[0]);
        }else{
          return parseInt(prev);
        }
      }, 0);
      return user_sum;
    }
  }
  catch(error){
    write_debug("get_user_sumでエラーが発生しました" + error.message);
  }
 
}

//引数として与えられたユーザの旅名を格納した列を返す。なければ0を返す
function get_tabimei_column(e){
  var user_tabimei = chk_user_tabimei(e);
  for (var i = 1; i <= TABIMEI_UPPER_LIMIT ; i++){
    if (MONEY_SHEET.getRange(STATUS_ROW, 2 * i - 1).getValue() == user_tabimei){
      return 2 * i - 1;
    }
  }
  return 0;
}
//与えられたユーザデータの旅名をどこかで上書きする
//どこかは旅名が何もない部分または、旅名の横の日付データが設定日以上経過している部分
function over_write_tabimei(e){
  var now = dayjs.dayjs();
  for (var i = 1; i <= TABIMEI_UPPER_LIMIT ; i++){
    if (MONEY_SHEET.getRange(STATUS_ROW, 2 * i - 1).getValue() == "" || 
        now.diff(dayjs.dayjs(MONEY_SHEET.getRange(STATUS_ROW, 2 * i).getValue()), "day") > HOLD_TABIMEI_DAYS){
      reset_money(2*i-1);
      MONEY_SHEET.getRange(STATUS_ROW, 2 * i - 1).setValue(chk_user_tabimei(e));
      //更新日を追加
      MONEY_SHEET.getRange(STATUS_ROW, get_tabimei_column(e) + 1).setValue(dayjs.dayjs().format());
      break;
    }
  }
}

//与えられた列と横の列データをすべてリセットする
function reset_money(target_column){
  var last_row = MONEY_SHEET.getRange(MONEY_SHEET.getMaxRows(), target_column).getNextDataCell(SpreadsheetApp.Direction.UP).getRow();  
  MONEY_SHEET.getRange(1, target_column, last_row,2).clear()
}


//ユーザのステータスを返す関数
function chk_user_status(e){
  return USER_SHEET.getRange(chk_userid(e), STATUS_COLUMN).getValue();
}

//イベントのユーザの旅名を返す関数
function chk_user_tabimei(e){
  return USER_SHEET.getRange(chk_userid(e), TABIMEI_COLUMN).getValue();
}
//ユーザの旅名を変更
function enter_user_tabimei(tabimei, e){
  USER_SHEET.getRange(chk_userid(e), TABIMEI_COLUMN).setValue(tabimei);
}
//ユーザのイベントのステータスを変更
function enter_user_status(status, e){
  USER_SHEET.getRange(chk_userid(e), STATUS_COLUMN).setValue(status);
}
//ユーザIDを探して、ないなら一番下の段に格納し、そのセル行位置を変える関数
function chk_userid(e){
  var last_row = USER_SHEET.getRange(USER_SHEET.getMaxRows(), USERID_COLUMN).getNextDataCell(SpreadsheetApp.Direction.UP).getRow();
  for (var i = 2 ; i <= last_row ;  i++){
    if (USER_SHEET.getRange(i, USERID_COLUMN).getValue() == e.source.userId){
      return i;
    }
  }
  USER_SHEET.getRange(last_row + 1, USERID_COLUMN).setValue(e.source.userId);
  return last_row + 1;
}

function send_message(sentence, e){
  var message = {
    "replyToken" : e.replyToken,
    "messages" : [
      {
        "type" : "text",
        "text" : sentence
      }
    ]
  }
  fetch_data(message);
}

/*入力内容が問題ないか確認する処理*/
function exe_verrification(question, e){
  var message = {
    "replyToken" : e.replyToken,
    "messages" : [
      {
        "type": "template",
        "altText": "this is a verification",
        "template": {
          "type": "confirm",
          "text": question + "\nよろしいですか?",
          "actions": [
            {
              "type": "message",
              "label": "うん",
              "text": "うん"
            },
            {
              "type": "message",
              "label": "やめとく",
              "text": "やめとく"
            }
          ]
        }
      }
    ]
  }
  fetch_data(message);

}
  
function fetch_data(postData){
  var replyData = {
    "method" : "post",
    "headers" : {
      "Content-Type" : "application/json",
      "Authorization" : "Bearer " + CHANEL_ACCESS_TOKEN
    },
    "payload" : JSON.stringify(postData)
  };
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", replyData);  
}

//全角記号・数字・英字を半角にする関数
function conv_full_to_half(str){
  //半角返還
  try{
    var half_val = str.replace(/[！-～]/g, 
      function(tmp_str){
        //文字コードシフト
        return String.fromCharCode(tmp_str.charCodeAt(0) - 0xFEE0 );
    });
    // 文字コードシフトで対応できない文字の変換
    return half_val.replace(/”/g, "\"")
      .replace(/’/g, "'")
      .replace(/‘/g, "`")
      .replace(/￥/g, "\\")
      .replace(/　/g, " ")
      .replace(/〜/g, "~")
      .replace(/＃/g, "#");
  }
  catch(error){
    write_debug("conv_full_to_halfでエラーが発生しました。 :" + error.message);
  }
}

//半角カタカナを全角カタカナに変換する関数
function conv_kana_half_full(str) {
  var kanaMap = {
    'ｶﾞ': 'ガ', 'ｷﾞ': 'ギ', 'ｸﾞ': 'グ', 'ｹﾞ': 'ゲ', 'ｺﾞ': 'ゴ',
    'ｻﾞ': 'ザ', 'ｼﾞ': 'ジ', 'ｽﾞ': 'ズ', 'ｾﾞ': 'ゼ', 'ｿﾞ': 'ゾ',
    'ﾀﾞ': 'ダ', 'ﾁﾞ': 'ヂ', 'ﾂﾞ': 'ヅ', 'ﾃﾞ': 'デ', 'ﾄﾞ': 'ド',
    'ﾊﾞ': 'バ', 'ﾋﾞ': 'ビ', 'ﾌﾞ': 'ブ', 'ﾍﾞ': 'ベ', 'ﾎﾞ': 'ボ',
    'ﾊﾟ': 'パ', 'ﾋﾟ': 'ピ', 'ﾌﾟ': 'プ', 'ﾍﾟ': 'ペ', 'ﾎﾟ': 'ポ',
    'ｳﾞ': 'ヴ', 'ﾜﾞ': 'ヷ', 'ｦﾞ': 'ヺ',
    'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
    'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
    'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
    'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
    'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
    'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
    'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
    'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
    'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
    'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン',
    'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
    'ｯ': 'ッ', 'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ',
    '｡': '。', '､': '、', 'ｰ': 'ー', '｢': '「', '｣': '」', '･': '・'
  };
  var reg = new RegExp('(' + Object.keys(kanaMap).join('|') + ')', 'g');
  return str
    .replace(reg, function (match) {
      return kanaMap[match];
    })
      .replace(/ﾞ/g, '゛')
      .replace(/ﾟ/g, '゜');
  };

 

/* フォローされた時の処理 */
function follow(e) {
  send_message("初めまして！このbotは旅の割り勘を手助けするよ！\n" + 
                "まずはこの旅の名前を決めて入力してね！\n" +
                "複数人で金額を入力するときは、全員同じ旅名にしてね！" +
                "その後、金額を積み上げて合計金額を表示するよ！\n\n" + 
                "「割り勘」と入力たら、今までその旅名で入力した金額の割り勘額を表示するよ！", e);
  enter_user_status("初回表示終了", e);
}

/* アンフォローされた時の処理 */
function unFollow(e){
  
}
