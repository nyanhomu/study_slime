// ===================================
// Firebase モジュールの読み込み & 初期化
// ===================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithRedirect,  
    getRedirectResult,    
    GoogleAuthProvider, 
    signOut, 
    onAuthStateChanged,
    setPersistence,          
    browserLocalPersistence   
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase 設定情報

const firebaseConfig = {
    apiKey: "AIzaSyBmAg0HarEY_wtcBXHBMoF1jWJOyQFHAHQ",
    authDomain: "study-80bcf.firebaseapp.com", 
    projectId: "study-80bcf",
    storageBucket: "study-80bcf.firebasestorage.app",
    messagingSenderId: "270819585587",
    appId: "1:270819585587:web:512632b242919b6631bd46",
    measurementId: "G-HJ5DRECVRT"
};

// Firebase 初期化

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null; // ログイン中のユーザーオブジェクト

// ===================================
// DOM要素の取得
// ===================================
const timeDisplay = document.getElementById("timer");
const toggleBtn = document.getElementById("toggleButton");
const finishBtn = document.getElementById("finishButton");
const gaugeBar = document.getElementById("gauge"); 
const levelValueDisplay = document.getElementById("level-value");
const slimeImg = document.getElementById("slime");
const openAiBtn = document.getElementById("openAiBtn");
const closeAiBtn = document.getElementById("closeAi");
const aiModal = document.getElementById("aiModal");
const generatePlanBtn = document.getElementById("generatePlanBtn");
const aiPlanResult = document.getElementById("aiPlanResult");

// ログイン関連UI
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("user-info");
const userName = document.getElementById("user-name");
const userIcon = document.getElementById("user-icon");

// 初期設定
const defaultSubjects = ["国語", "数学", "英語", "理科", "社会", "その他"];
let subjects = [];
let targetMinutes = {};

let elapsedTime = 0;
let timerInterval = null;
let isRunning = false;

let level = 1;
let gaugeLevel = 0;
let totalTime = 0;
let radarChart = null;
let barChart = null;
let currentViewDate = new Date(); 

// ===================================
// ログイン / 認証処理
// ===================================

// リダイレクトログイン結果のチェック
getRedirectResult(auth)
    .then((result) => {
        if (result) {
            console.log("リダイレクトログイン完了:", result.user);
        }
    })
    .catch((error) => {
        console.error("リダイレクトエラー:", error);
        alert(`ログインエラー: ${error.message}`);
    });

// ログイン状態の監視
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        if (loginBtn) loginBtn.style.display = "none";
        if (userInfo) userInfo.style.display = "flex";
        if (userName) userName.textContent = user.displayName;
        if (userIcon) userIcon.src = user.photoURL || "";

        console.log("ログイン成功:", user.uid);
        await loadUserDataFromCloud(user.uid);
    } else {
        currentUser = null;
        if (loginBtn) loginBtn.style.display = "block";
        if (userInfo) userInfo.style.display = "none";
        
        console.log("未ログイン状態: ローカルデータを使用します。");
        loadUserDataFromLocal();
    }
});

// ログインボタン
if (loginBtn) {
    loginBtn.onclick = async () => {
        try {
            await setPersistence(auth, browserLocalPersistence);
            await signInWithRedirect(auth, provider);
        } catch (error) {
            console.error("ログイン開始エラー:", error);
            alert(`ログイン画面への遷移に失敗しました: ${error.message}`);
        }
    };
}

//  ログアウトボタン
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        try {
            await signOut(auth);
            alert("ログアウトしました。");
        } catch (error) {
            console.error("ログアウトエラー:", error);
        }
    };
}

// ===================================
// データ管理（Local & Cloud）
// ===================================

// ローカルから読み込み
function loadUserDataFromLocal() {
    level = Number(localStorage.getItem("study_level")) || 1;
    gaugeLevel = Number(localStorage.getItem("study_gauge")) || 0;
    totalTime = Number(localStorage.getItem("study_totalTime")) || 0;
    
    const savedSubjects = localStorage.getItem("study_subjects");
    subjects = savedSubjects ? JSON.parse(savedSubjects) : [...defaultSubjects];
    
    const savedTargets = localStorage.getItem("study_targetMinutes");
    targetMinutes = savedTargets ? JSON.parse(savedTargets) : {};
    
    subjects.forEach(sub => {
        if (targetMinutes[sub] === undefined) targetMinutes[sub] = 600; 
    });

    updateUIAll();
}

// クラウドから読み込み (Firestore)
async function loadUserDataFromCloud(userId) {
    try {
        const userDocRef = doc(db, "users", userId);
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("クラウドデータ読み込み完了:", data);

            level = data.level || 1;
            gaugeLevel = data.gaugeLevel || 0;
            totalTime = data.totalTime || 0;
            subjects = data.subjects || [...defaultSubjects];
            targetMinutes = data.targetMinutes || {};
            
            if (data.dailyLogs) {
                localStorage.setItem("dailyStudyLog", JSON.stringify(data.dailyLogs));
            }

            // 同期用にローカル側も上書き
            saveUserDataToLocal();
        } else {
            console.log("新規ユーザーです。現在のデータで初期登録します。");
            await saveUserDataToCloud();
        }
        updateUIAll();
    } catch (error) {
        console.error("クラウド読み込みエラー:", error);
    }
}

// ローカルに保存
function saveUserDataToLocal() {
    localStorage.setItem("study_level", level);
    localStorage.setItem("study_gauge", gaugeLevel);
    localStorage.setItem("study_totalTime", totalTime);
    localStorage.setItem("study_targetMinutes", JSON.stringify(targetMinutes));
    localStorage.setItem("study_subjects", JSON.stringify(subjects));
}

// クラウドに保存 (Firestore)
async function saveUserDataToCloud() {
    if (!currentUser) return; 

    const userDocRef = doc(db, "users", currentUser.uid);
    const dataToSave = {
        level: level,
        gaugeLevel: gaugeLevel,
        totalTime: totalTime,
        subjects: subjects,
        targetMinutes: targetMinutes,
        dailyLogs: loadDailyLog(),
        updatedAt: new Date()
    };

    try {
        await setDoc(userDocRef, dataToSave, { merge: true });
        console.log("クラウド保存成功！");
    } catch (error) {
        console.error("クラウド保存エラー:", error);
    }
}

// 全体データをまとめて保存
function saveAllData() {
    saveUserDataToLocal();
    if (currentUser) {
        saveUserDataToCloud();
    }
}

function loadDailyLog() {
    const log = localStorage.getItem("dailyStudyLog");
    return log ? JSON.parse(log) : {};
}

// UI一括更新
function updateUIAll() {
    if (levelValueDisplay) levelValueDisplay.textContent = level;
    updateSubjectSelect();
    updateGaugeDisplay();
    updateSlimeImage();
    drawRadarChart();
}

// ===================================
// 画面初期化イベント
// ===================================
window.addEventListener("load", () => {
    loadUserDataFromLocal();
});

function updateSubjectSelect() {
    const select = document.getElementById("subjectSelect");
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = "";
    subjects.forEach(sub => {
        const opt = document.createElement("option");
        opt.value = sub;
        opt.textContent = sub;
        select.appendChild(opt);
    });
    if (subjects.includes(currentVal)) select.value = currentVal;
}

function updateGaugeDisplay() {
    const reqExp = 100 + (level - 1) * 50;
    if (gaugeBar) gaugeBar.style.height = (gaugeLevel / reqExp * 100) + "%";

    const hours = Math.floor(totalTime / 3600000);
    const minutes = Math.floor((totalTime % 3600000) / 60000);
    const gText = document.getElementById("gaugeText");
    if (gText) gText.textContent = `${hours}時間 ${minutes}分`;
}

// ===================================
// 目標設定モーダル
// ===================================
const openTargetBtn = document.getElementById("openTargetBtn");
if (openTargetBtn) {
    openTargetBtn.onclick = () => {
        renderTargetModal();
        document.getElementById("targetModal").style.display = "block";
    };
}

function renderTargetModal() {
    const container = document.getElementById("targetInputsContainer");
    if (!container) return;
    container.innerHTML = ""; 
    subjects.forEach((sub, index) => {
        const totalMin = targetMinutes[sub] || 0;
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        const row = document.createElement("div");
        row.style.cssText = "display:flex; justify-content:space-between; margin-bottom:12px; align-items:center; border-bottom:1px solid #eee; padding-bottom:8px;";
        row.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <button class="del-sub-btn" data-index="${index}" style="background:#ff4d4d; color:white; border:none; border-radius:50%; width:22px; height:22px; cursor:pointer;">×</button>
                <span style="font-weight:bold;">${sub}</span>
            </div>
            <div>
                <input type="number" class="target-h" value="${h}" style="width:45px;"> 時 
                <input type="number" class="target-m" value="${m}" style="width:45px;"> 分
            </div>
        `;
        container.appendChild(row);
    });

    document.querySelectorAll(".del-sub-btn").forEach(btn => {
        btn.onclick = (e) => {
            const idx = e.target.dataset.index;
            if (confirm(`「${subjects[idx]}」を削除しますか？`)) {
                subjects.splice(idx, 1);
                renderTargetModal(); 
            }
        };
    });
}

const addSubjectBtn = document.getElementById("addSubjectBtn");
if (addSubjectBtn) {
    addSubjectBtn.onclick = () => {
        const input = document.getElementById("newSubjectName");
        const name = input.value.trim();
        if (name && !subjects.includes(name)) {
            subjects.push(name);
            targetMinutes[name] = 600;
            input.value = "";
            renderTargetModal();
        } else {
            alert("名前が空か、既に同じ教科があります。");
        }
    };
}

const saveTargetsBtn = document.getElementById("saveTargetsBtn");
if (saveTargetsBtn) {
    saveTargetsBtn.onclick = () => {
        const hInps = document.querySelectorAll(".target-h");
        const mInps = document.querySelectorAll(".target-m");
        subjects.forEach((sub, i) => {
            targetMinutes[sub] = (parseInt(hInps[i].value) || 0) * 60 + (parseInt(mInps[i].value) || 0);
        });
        saveAllData();
        updateSubjectSelect();
        document.getElementById("targetModal").style.display = "none";
        drawRadarChart();
    };
}

const closeTarget = document.getElementById("closeTarget");
if (closeTarget) {
    closeTarget.onclick = () => document.getElementById("targetModal").style.display = "none";
}

// ===================================
// タイマー処理
// ===================================
function updateDisplay(time) {
    const minutes = Math.floor(time / 60000);
    const seconds = Math.floor((time % 60000) / 1000);
    const tenth = Math.floor((time % 1000) / 100);
    if (timeDisplay) {
        timeDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${tenth}`;
    }
}

if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
        if (isRunning) {
            clearInterval(timerInterval);
            toggleBtn.textContent = "開始";
            toggleBtn.classList.remove("stop");
            document.getElementById("message").textContent = "休憩中...";
            isRunning = false;
        } else {
            isRunning = true;
            const startTime = Date.now() - elapsedTime;
            timerInterval = setInterval(() => {
                elapsedTime = Date.now() - startTime;
                updateDisplay(elapsedTime);
            }, 100);
            toggleBtn.textContent = "停止";
            toggleBtn.classList.add("stop");
            document.getElementById("message").textContent = "成長中...";
        }
    });
}

if (finishBtn) {
    finishBtn.addEventListener("click", () => {
        if (elapsedTime === 0) return;
        clearInterval(timerInterval);
        isRunning = false;
        toggleBtn.textContent = "開始";
        toggleBtn.classList.remove("stop");
        document.getElementById("message").textContent = "勉強開始！がんばれ自分！";

        const spentTime = elapsedTime;
        elapsedTime = 0;
        updateDisplay(0);

        totalTime += spentTime;
        saveToLogs(spentTime);

        gaugeLevel += spentTime / 1000;
        const getRequiredExp = (l) => 100 + (l - 1) * 50;
        while (gaugeLevel >= getRequiredExp(level)) {
            gaugeLevel -= getRequiredExp(level);
            level++;
            updateSlimeImage();
            alert(`レベルアップ！ Level ${level}`);
        }

        if (levelValueDisplay) levelValueDisplay.textContent = level;
        updateGaugeDisplay();
        
        // ローカルおよびクラウドへ保存
        saveAllData();
        
        drawRadarChart();
        openChartModal();
    });
}

// ===================================
// グラフ・カレンダー描画
// ===================================
function drawRadarChart() {
    const canvas = document.getElementById("subjectRadarChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const log = loadDailyLog();
    
    const subjectTotals = subjects.map(sub => {
        let totalMs = 0;
        Object.keys(log).forEach(date => { if (log[date] && log[date][sub]) totalMs += log[date][sub]; });
        return totalMs / 3600000;
    });

    const targetData = subjects.map(sub => (targetMinutes[sub] || 0) / 60);
    const maxVal = Math.max(...subjectTotals, ...targetData, 1);

    if (radarChart) radarChart.destroy();
    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: subjects,
            datasets: [
                {
                    label: '実績 (時間)',
                    data: subjectTotals,
                    backgroundColor: 'rgba(76, 175, 80, 0.2)',
                    borderColor: 'rgba(76, 175, 80, 1)',
                    borderWidth: 2
                },
                {
                    label: '目標 (時間)',
                    data: targetData,
                    backgroundColor: 'rgba(255, 0, 0, 0.05)',
                    borderColor: 'rgba(255, 0, 0, 0.5)',
                    borderDash: [5, 5],
                    borderWidth: 1,
                    pointRadius: 0
                }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: { r: { beginAtZero: true, suggestedMax: maxVal, ticks: { display: true } } }
        }
    });
}

function drawChart() {
    const canvas = document.getElementById("studyChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const log = loadDailyLog(); 
    const dates = Object.keys(log).sort().slice(-7); 
    
    const loggedSubjects = new Set();
    dates.forEach(date => {
        Object.keys(log[date]).forEach(sub => loggedSubjects.add(sub));
    });
    const displaySubjects = Array.from(loggedSubjects);

    const datasets = displaySubjects.map((sub, i) => {
        const fixedColors = { "国語": "#ffadad", "数学": "#9bf6ff", "英語": "#caffbf", "理科": "#ffd6a5", "社会": "#bdb2ff", "その他": "#eeeeee" };
        const bgColor = fixedColors[sub] || `hsl(${(i * 137.5) % 360}, 70%, 80%)`;
        return {
            label: sub,
            data: dates.map(date => (log[date][sub] || 0) / 3600000),
            backgroundColor: bgColor
        };
    });

    if (barChart) barChart.destroy();
    barChart = new Chart(ctx, { 
        type: "bar", 
        data: { labels: dates, datasets: datasets }, 
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } } 
    });
}

function drawCalendar() {
    const grid = document.getElementById("calendar-grid");
    const title = document.getElementById("calendarMonthTitle");
    if(!grid || !title) return;
    const log = loadDailyLog();
    grid.innerHTML = "";
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    title.textContent = `${year}年 ${month + 1}月`;
    ["日", "月", "火", "水", "木", "金", "土"].forEach(w => {
        const div = document.createElement("div");
        div.className = "calendar-weekday";
        div.textContent = w;
        grid.appendChild(div);
    });
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement("div"));
    for (let date = 1; date <= lastDate; date++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
        const dayDiv = document.createElement("div");
        dayDiv.className = "calendar-day";
        dayDiv.textContent = date;
        if (dateStr === new Date().toLocaleDateString('sv-SE')) dayDiv.classList.add("today-mark");
        if (log[dateStr]) {
            dayDiv.classList.add("has-study-data");
            const dot = document.createElement("div");
            dot.className = "study-dot";
            dayDiv.appendChild(dot);
        }
        grid.appendChild(dayDiv);
    }
}

const prevMonth = document.getElementById("prevMonth");
if (prevMonth) prevMonth.onclick = () => { currentViewDate.setMonth(currentViewDate.getMonth() - 1); drawCalendar(); };

const nextMonth = document.getElementById("nextMonth");
if (nextMonth) nextMonth.onclick = () => { currentViewDate.setMonth(currentViewDate.getMonth() + 1); drawCalendar(); };

function displayHistory() {
    const historyList = document.getElementById("history-list");
    if (!historyList) return;
    const log = loadDailyLog();
    const dates = Object.keys(log).sort().reverse(); 
    historyList.innerHTML = dates.length === 0 ? "<li>まだ記録がありません。</li>" : ""; 
    dates.forEach(date => {
        let dailyTotalMs = 0;
        let details = [];
        for (const [subject, ms] of Object.entries(log[date])) { dailyTotalMs += ms; details.push(`${subject}: ${Math.floor(ms / 60000)}分`); }
        const li = document.createElement("li");
        li.style.borderBottom = "1px solid #eee";
        li.style.padding = "10px 0";
        li.innerHTML = `<strong>${date} — 合計 ${(dailyTotalMs / 3600000).toFixed(1)}時間</strong><br><small>${details.join(" / ")}</small>`;
        historyList.appendChild(li);
    });
}

function openChartModal() {
    const chartModal = document.getElementById("chartModal");
    if (chartModal) {
        chartModal.style.display = "block";
        setTimeout(() => { drawChart(); displayHistory(); drawCalendar(); }, 200);
    }
}

const closeChart = document.getElementById("closeChart");
if (closeChart) {
    closeChart.onclick = () => { document.getElementById("chartModal").style.display = "none"; };
}

function saveToLogs(spentTime) {
    const selectedSubject = document.getElementById("subjectSelect").value;
    const today = new Date().toLocaleDateString('sv-SE'); 
    const log = loadDailyLog();
    if (!log[today]) log[today] = {};
    log[today][selectedSubject] = (log[today][selectedSubject] || 0) + spentTime;
    localStorage.setItem("dailyStudyLog", JSON.stringify(log));
}

function updateSlimeImage() {
    if (!slimeImg) return;
    let src = "images/スライム1.png";
    if (level >= 10) src = "images/スライム3.png";
    else if (level >= 5) src = "images/スライム2.png";
    slimeImg.src = src;
}

// ===================================
// AI プランナー (API 経由)
// ===================================
if (openAiBtn) {
    openAiBtn.onclick = () => { aiModal.style.display = "block"; };
}
if (closeAiBtn) {
    closeAiBtn.onclick = () => { aiModal.style.display = "none"; };
}

if (generatePlanBtn) {
    generatePlanBtn.onclick = async () => {
        generatePlanBtn.disabled = true;
        generatePlanBtn.textContent = " プランを作成中...";
        aiPlanResult.textContent = "学習データを分析しています...";

        const log = loadDailyLog();
        const targets = targetMinutes;
        const currentLevel = level;

        const prompt = `
あなたはRPG風の親切な学習アドバイザーです。
以下の学習アプリのユーザーデータをもとに、今後の具体的な学習プランと励ましのメッセージを作成してください。

【ユーザーの現在のステータス】
・プレイヤーレベル: Lv.${currentLevel}
・各教科の目標設定（分単位）: ${JSON.stringify(targets)}
・これまでの学習ログ（日付ごとの各教科勉強時間/ミリ秒）: ${JSON.stringify(log)}

【出力フォーマット】
1. 【現状分析】（現在の成長ぶりや偏りについての評価）
2. 【明日〜今週のおすすめプラン】（具体的にどの教科を何分やると良いか）
`;

        try {
            const response = await fetch("/api/generate-plan", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ prompt: prompt })
            });

            const data = await response.json();
            
            if (data.choices && data.choices[0].message.content) {
                aiPlanResult.textContent = data.choices[0].message.content;
            } else {
                aiPlanResult.textContent = "プランの作成に失敗しました。";
            }

        } catch (error) {
            console.error("Error:", error);
            aiPlanResult.textContent = "通信エラーが発生しました。";
        } finally {
            generatePlanBtn.disabled = false;
            generatePlanBtn.textContent = " プランを再生成する";
        }
    };
}
