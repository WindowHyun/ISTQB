(async () => {
      const appLogStore = (() => {
        const maxEntries = 200;
        const entries = [];
        const levels = ["log", "info", "warn", "error"];

        function normalizeLogValue(value) {
          if (value instanceof Error) {
            return [value.name, value.message, value.stack]
              .filter(Boolean)
              .join(": ");
          }
          if (typeof value === "string") return value;
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        }

        function add(level, values) {
          entries.push({
            level,
            time: new Date().toISOString(),
            message: values.map(normalizeLogValue).join(" "),
          });
          if (entries.length > maxEntries) {
            entries.splice(0, entries.length - maxEntries);
          }
        }

        levels.forEach((level) => {
          const original =
            typeof console[level] === "function"
              ? console[level].bind(console)
              : console.log.bind(console);
          console[level] = (...values) => {
            add(level, values);
            original(...values);
          };
        });

        window.addEventListener("error", (event) => {
          add("error", [
            event.message || "window error",
            event.filename
              ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}`
              : "",
            event.error || "",
          ]);
        });

        window.addEventListener("unhandledrejection", (event) => {
          add("error", ["unhandled promise rejection", event.reason || ""]);
        });

        add("info", ["app started"]);

        return {
          entries,
          add,
          clear() {
            entries.splice(0, entries.length);
            add("info", ["console log cleared"]);
          },
          text() {
            if (entries.length === 0) return "수집된 로그가 없습니다.";
            return entries
              .map(
                (entry) =>
                  `[${entry.time}] ${entry.level.toUpperCase()} ${entry.message}`,
              )
              .join("\n");
          },
        };
      })();
      window.ISTQB_LOGGER = appLogStore;

      const questionDataErrors = {};
      const productData = {
        istqb: { source: "", sets: [] },
        csts: { source: "", sets: [] },
      };
      const productLabels = {
        istqb: "ISTQB FL",
        csts: "CSTS FL",
      };

      function formatQuestionForUi(rawQuestion) {
        const q = JSON.parse(JSON.stringify(rawQuestion));

        const fixNewlines = (blocks) => {
          if (!Array.isArray(blocks)) return blocks;
          return blocks.map((b) => {
            if (typeof b.text === "string") {
              b.text = b.text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
              b.text = b.text.replace(/\n{3,}/g, "\n\n");
              b.text = b.text.replace(/([^\n])\s*(•|○|①|②|③|④|⑤|Ⓐ|Ⓑ|Ⓒ|Ⓓ|Ⓔ|ⓐ|ⓑ|ⓒ|ⓓ|ⓔ|㉠|㉡|㉢|㉣|㉤|(?<![가-힣A-Za-z0-9])[1-9][0-9]*[\.\)]\s)/g, "$1\n$2");
              b.text = b.text.replace(/([^\n])\s*(가\.|나\.|다\.|라\.|마\.)\s/g, (match, p1, p2) => { if (p1 === "." || p1 === "?" || p1 === "!") return match; return `${p1}\n${p2} `; });
              b.text = b.text.replace(/([^\n])\s*(가\.|나\.|다\.|라\.|마\.)\s/g, (match, p1, p2) => { if (p1 === "." || p1 === "?" || p1 === "!") return match; return `${p1}\n${p2} `; });
              b.text = b.text.replace(/([^\n])\s*([1-4]사분면:)/g, "$1\n$2");
              b.text = b.text.replace("리뷰 활동은 다음과 같다: 개별 리뷰 리뷰 착수 리뷰 계획 의사소통 및 분석", "리뷰 활동은 다음과 같다:\nA. 개별 리뷰\nB. 리뷰 착수\nC. 리뷰 계획\nD. 의사소통 및 분석");
              b.text = b.text.replace("그리고 리뷰에서 맡은 책임은 다음과 같다: 리뷰 회의의 효과적인 진행과 편안한 리뷰 환경을 보장한다 리뷰 회의에서 결정사항, 식별한 새로운 이상 현상과 같은 리뷰 정보를 기록한다 리뷰 대상을 결정하고 리뷰에 참여할인력, 리뷰 시간 등 자원을 제공한다 리뷰 진행 시기, 장소 협의 등 리뷰에 대한 전반적인 책임을 진다", "그리고 리뷰에서 맡은 책임은 다음과 같다:\nA. 리뷰 회의의 효과적인 진행과 편안한 리뷰 환경을 보장한다\nB. 리뷰 회의에서 결정사항, 식별한 새로운 이상 현상과 같은 리뷰 정보를 기록한다\nC. 리뷰 대상을 결정하고 리뷰에 참여할 인력, 리뷰 시간 등 자원을 제공한다\nD. 리뷰 진행 시기, 장소 협의 등 리뷰에 대한 전반적인 책임을 진다");
              b.text = b.text.replace("다음과 같은 테스트 활동이 있다: 테스트 분석 테스트 설계 테스트 구현 테스트 완료", "다음과 같은 테스트 활동이 있다:\nA. 테스트 분석\nB. 테스트 설계\nC. 테스트 구현\nD. 테스트 완료");
            }
            return b;
          });
        };

        q.stem = fixNewlines(q.stem);
        q.explanation = fixNewlines(q.explanation);

        if (q.type !== "multiple_choice") {
          return q;
        }

        const optionRegexes = [
          /(?<![가-힣A-Za-z0-9])([가-라][\-\.])\s+(.*?)(?=(?:(?<![가-힣A-Za-z0-9])[가-라][\-\.])\s+|$)/gs,
          /([1-4]\))\s*(.*?)(?=(?:[1-4]\))|$)/gs,
          /([①-④])\s*(.*?)(?=(?:[①-④])|$)/gs,
          /([A-D][\.\)])\s*(.*?)(?=(?:[A-D][\.\)])|$)/gs,
        ];

        const trySplitOptions = (text) => {
          for (const regex of optionRegexes) {
            const matches = [...text.matchAll(regex)];
            if (matches.length >= 2 && matches.length <= 5) {
              return matches.map((m) => ({ label: m[1], text: m[2].trim() }));
            }
          }
          return null;
        };

        const extractFromStem = () => {
          if (!q.stem || q.stem.length === 0) return false;
          const lastBlock = q.stem[q.stem.length - 1];
          if (lastBlock.type !== "paragraph" && lastBlock.type !== "prompt") return false;

          const text = lastBlock.text;
          const match = text.match(/(?<![가-힣A-Za-z0-9])([가-라][\-\.]\s+|[1-4]\)|[①-④]|[A-D][\.\)])\s*/);
          if (match) {
            const index = match.index;
            const potentialQuestion = text.substring(0, index).trim();
            const potentialOptions = text.substring(index);

            const extracted = trySplitOptions(potentialOptions);
            if (extracted && extracted.length >= 2) {
              lastBlock.text = potentialQuestion;
              if (lastBlock.text === "") q.stem.pop();
              q.options = extracted.map((ext, i) => ({
                key: String.fromCharCode(97 + i),
                text: `${ext.label} ${ext.text}`,
              }));
              return true;
            }
          }
          return false;
        };

        const extractFromOptions = () => {
          if (q.options && q.options.length === 1) {
            const extracted = trySplitOptions(q.options[0].text);
            if (extracted && extracted.length >= 2) {
              q.options = extracted.map((ext, i) => ({
                key: String.fromCharCode(97 + i),
                text: `${ext.label} ${ext.text}`,
              }));
              return true;
            }
          }
          return false;
        };

        if (!q.options || q.options.length <= 1) {
          let extracted = extractFromOptions();
          if (!extracted) extractFromStem();
        }

        if (Array.isArray(q.options)) {
          q.options = q.options.map((opt) => {
            if (typeof opt.text === "string") {
              opt.text = opt.text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
            }
            return opt;
          });
        }

        return q;
      }

      function normalizeSetPayload(payload, catalogItem) {
        const meta = payload?.meta || {};
        const certification = String(
          meta.certification || catalogItem.certification || "",
        ).toLowerCase();
        return {
          id: meta.id || catalogItem.id,
          legacySetId: meta.legacySetId || catalogItem.legacySetId || meta.setId,
          title: meta.title || catalogItem.title || catalogItem.id,
          questionPdf: meta.questionPdf || "",
          answerPdf: meta.answerPdf || "",
          questions: Array.isArray(payload?.questions)
            ? payload.questions.map((rawQuestion) => {
                const question = formatQuestionForUi(rawQuestion);
                return {
                  ...question,
                  setId: meta.id || catalogItem.id,
                  legacySetId: meta.legacySetId || catalogItem.legacySetId || meta.setId,
                  setTitle: meta.title || catalogItem.title || catalogItem.id,
                  certification,
                };
              })
            : [],
        };
      }

      async function fetchQuestionJson(path) {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load ${path}: ${response.status}`);
        }
        return response.json();
      }

      async function loadQuestionCatalog() {
        const candidates = ["./data/index.json", "./public/data/index.json"];
        let lastError = null;
        for (const indexPath of candidates) {
          try {
            const catalog = await fetchQuestionJson(indexPath);
            return {
              basePath: indexPath.replace(/index\.json$/, ""),
              catalog,
            };
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError || new Error("Question catalog is missing.");
      }

      async function loadQuestionProductData() {
        try {
          const { basePath, catalog } = await loadQuestionCatalog();
          const items = Array.isArray(catalog.sets) ? catalog.sets : [];
          const loadedSets = await Promise.all(
            items.map(async (item) => ({
              item,
              payload: await fetchQuestionJson(`${basePath}${item.path.replace(/^\.\//, "")}`),
            })),
          );
          loadedSets.forEach(({ item, payload }) => {
            const product = String(item.certification || "").toLowerCase();
            if (!productData[product]) return;
            const set = normalizeSetPayload(payload, item);
            productData[product].sets.push(set);
            productData[product].source ||= payload?.meta?.source || "";
          });
          Object.entries(productData).forEach(([product, value]) => {
            if (value.sets.length === 0) {
              questionDataErrors[product] = `${productLabels[product]} question data is empty.`;
            }
          });
        } catch (error) {
          questionDataErrors.istqb = "Question data is missing or empty.";
          questionDataErrors.csts = "CSTS data is missing or empty.";
          appLogStore.add("error", ["question data load failed", error]);
        }
      }

      await loadQuestionProductData();
      const istqbDataError = questionDataErrors.istqb || "";
      const lastProductStorageKey = "istqb-csts-last-product";

      function loadLastProduct() {
        try {
          const product = localStorage.getItem(lastProductStorageKey);
          return productData[product] ? product : "";
        } catch {
          return "";
        }
      }

      function saveLastProduct() {
        try {
          localStorage.setItem(lastProductStorageKey, activeProduct);
        } catch {
        }
      }

      function clearLastProduct() {
        try {
          localStorage.removeItem(lastProductStorageKey);
        } catch {
        }
      }

      const lastProduct = loadLastProduct();
      let activeProduct = lastProduct || "istqb";
      let data = productData[activeProduct];
      function persistenceKey() {
        return activeProduct === "csts"
          ? "csts-fl-v1-sample-persistence"
          : "istqb-fl-v4-sample-persistence";
      }

      const savedUiState = loadUiState();
      const state = {
        setId: validSetId(savedUiState.setId),
        mode: validMode(savedUiState.mode),
        index: Number.isInteger(savedUiState.index) ? savedUiState.index : 0,
        examGraded: savedUiState.examGraded || {},
        randomGraded: Boolean(savedUiState.randomGraded),
        randomRefs: Array.isArray(savedUiState.randomRefs)
          ? savedUiState.randomRefs
          : [],
        reviewRetake: savedUiState.reviewRetake || {},
        reviewIds: savedUiState.reviewIds || {},
        navCollapsed: Boolean(savedUiState.navCollapsed),
        sidebarCollapsed: savedUiState.sidebarCollapsed !== false,
        fontSize: validFontSize(savedUiState.fontSize),
        elapsedSeconds: Number.isFinite(savedUiState.elapsedSeconds)
          ? savedUiState.elapsedSeconds
          : Number.isFinite(savedUiState.startedAt)
            ? Math.max(0, (Date.now() - savedUiState.startedAt) / 1000)
            : 0,
        lastTick: Date.now(),
        answers: loadAnswers(),
        histories: sanitizeHistories(savedUiState.histories),
      };

      let backgroundedAt = 0;
      let dbPromise = null;

      const productGate = document.querySelector("#productGate");
      const appShell = document.querySelector(".app-shell");
      const openIstqbBtn = document.querySelector("#openIstqbBtn");
      const openCstsBtn = document.querySelector("#openCstsBtn");
      const productHomeBtn = document.querySelector("#productHomeBtn");
      const topbarHomeBtn = document.querySelector("#topbarHomeBtn");
      const productSubtitle = document.querySelector("#productSubtitle");
      const productTitle = document.querySelector("#productTitle");
      const sidebar = document.querySelector(".sidebar");
      const sidebarToggleBtn = document.querySelector("#sidebarToggleBtn");
      const mobileSetText = document.querySelector("#mobileSetText");
      const mobileProgressText = document.querySelector("#mobileProgressText");
      const mobileProgressBadge = document.querySelector(
        "#mobileProgressBadge",
      );
      const mobileTimerBadge = document.querySelector("#mobileTimerBadge");
      const examSelect = document.querySelector("#examSelect");
      const progressText = document.querySelector("#progressText");
      const progressFill = document.querySelector("#progressFill");
      const timerText = document.querySelector("#timerText");
      const setMeta = document.querySelector("#setMeta");
      const questionTitle = document.querySelector("#questionTitle");
      const workspace = document.querySelector(".workspace");
      const appStatus = document.querySelector("#appStatus");
      const questionStem = document.querySelector("#questionStem");
      const questionFigure = document.querySelector("#questionFigure");
      const options = document.querySelector("#options");
      const feedback = document.querySelector("#feedback");
      const questionNav = document.querySelector("#questionNav");
      const gradeActionSection = document.querySelector("#gradeActionSection");
      const gradeBtn = document.querySelector("#gradeBtn");
      const retryWrongBtn = document.querySelector("#retryWrongBtn");
      const wrongNoteBtn = document.querySelector("#wrongNoteBtn");
      const exportBackupBtn = document.querySelector("#exportBackupBtn");
      const importBackupBtn = document.querySelector("#importBackupBtn");
      const backupFileInput = document.querySelector("#backupFileInput");
      const consoleLogBtn = document.querySelector("#consoleLogBtn");
      const actionHint = document.querySelector("#actionHint");
      const backupStatus = document.querySelector("#backupStatus");
      const toggleNavBtn = document.querySelector("#toggleNavBtn");
      const resetBtn = document.querySelector("#resetBtn");
      const resetAllBtn = document.querySelector("#resetAllBtn");
      const prevBtn = document.querySelector("#prevBtn");
      const nextBtn = document.querySelector("#nextBtn");
      const navSummary = document.querySelector("#navSummary");
      const figureModal = document.querySelector("#figureModal");
      const figureModalBody = document.querySelector("#figureModalBody");
      const figureModalCloseBtn = document.querySelector(
        "#figureModalCloseBtn",
      );
      const wrongNoteModal = document.querySelector("#wrongNoteModal");
      const wrongNoteBody = document.querySelector("#wrongNoteBody");
      const wrongNoteCloseBtn = document.querySelector("#wrongNoteCloseBtn");
      const clearWrongNoteBtn = document.querySelector("#clearWrongNoteBtn");
      const backupImportModal = document.querySelector("#backupImportModal");
      const backupImportBody = document.querySelector("#backupImportBody");
      const backupImportCloseBtn = document.querySelector(
        "#backupImportCloseBtn",
      );
      const consoleLogModal = document.querySelector("#consoleLogModal");
      const consoleLogMeta = document.querySelector("#consoleLogMeta");
      const consoleLogText = document.querySelector("#consoleLogText");
      const consoleLogStatus = document.querySelector("#consoleLogStatus");
      const consoleLogCloseBtn = document.querySelector("#consoleLogCloseBtn");
      const copyConsoleLogBtn = document.querySelector("#copyConsoleLogBtn");
      const exportConsoleLogBtn = document.querySelector("#exportConsoleLogBtn");
      const clearConsoleLogBtn = document.querySelector("#clearConsoleLogBtn");
      const settingsPanelToggleBtn = document.querySelector(
        "#settingsPanelToggleBtn",
      );
      const settingsPanel = document.querySelector("#settingsPanel");

      let feedbackExpanded = false;
      let pendingBackupSnapshot = null;
      let pendingBackupPayload = null;
      let wrongNoteFilter = "all";
      let lastRenderedQuestionKey = "";
      let lastModalTrigger = null;
      const emptySet = {
        id: "",
        title: productLabels[activeProduct],
        questions: [],
      };

      function currentSet() {
        return (
          data.sets.find((set) => set.id === state.setId) ||
          data.sets[0] ||
          { ...emptySet, title: productLabels[activeProduct] }
        );
      }

      function validSetId(setId) {
        if (!data.sets.length) return "";
        return data.sets.some((set) => set.id === setId)
          ? setId
          : data.sets[0].id;
      }

      function validMode(mode) {
        return ["practice", "exam", "random", "review"].includes(mode)
          ? mode
          : "practice";
      }

      function validFontSize(size) {
        return ["small", "normal", "large"].includes(size) ? size : "normal";
      }

      function currentQuestions() {
        const questions = currentSet().questions;
        if (state.mode === "random") return randomQuestions();
        if (state.mode !== "review") return questions;
        if (!isExamGraded()) return [];
        if (isReviewRetake()) {
          const ids = state.reviewIds[state.setId] || [];
          return questions.filter((question) => ids.includes(question.number));
        }
        return questions.filter((question) => !isCorrect(question, "exam"));
      }

      function allQuestions() {
        return data.sets.flatMap((set) =>
          set.questions.map((question) => ({
            ...question,
            setId: set.id,
            setTitle: set.title,
          })),
        );
      }

      function shuffle(items) {
        const copy = [...items];
        for (let index = copy.length - 1; index > 0; index -= 1) {
          const swapIndex = Math.floor(Math.random() * (index + 1));
          [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
        }
        return copy;
      }

      function randomQuestionCount() {
        return Math.min(40, allQuestions().length);
      }

      function generateRandomRefs() {
        state.randomRefs = shuffle(allQuestions())
          .slice(0, randomQuestionCount())
          .map((question) => ({
            setId: question.setId,
            number: question.number,
          }));
      }

      function randomQuestions() {
        if (state.randomRefs.length !== randomQuestionCount() && !isReviewRetake())
          generateRandomRefs();
        return state.randomRefs
          .map((ref) => {
            const set = data.sets.find((item) => item.id === ref.setId);
            const question = set?.questions.find(
              (item) => item.number === ref.number,
            );
            return question
              ? { ...question, setId: set.id, setTitle: set.title }
              : null;
          })
          .filter(Boolean);
      }

      function storageKey() {
        return activeProduct === "csts"
          ? "csts-fl-v1-sample-answers"
          : "istqb-fl-v4-sample-answers";
      }

      function uiStorageKey() {
        return activeProduct === "csts"
          ? "csts-fl-v1-sample-ui-state"
          : "istqb-fl-v4-sample-ui-state";
      }

      function buildSnapshot() {
        return {
          updatedAt: Date.now(),
          answers: state.answers,
          uiState: {
            setId: state.setId,
            mode: state.mode,
            index: state.index,
            examGraded: state.examGraded,
            randomGraded: state.randomGraded,
            randomRefs: state.randomRefs,
            reviewRetake: state.reviewRetake,
            reviewIds: state.reviewIds,
            histories: sanitizeHistories(state.histories),
            navCollapsed: state.navCollapsed,
            sidebarCollapsed: state.sidebarCollapsed,
            fontSize: state.fontSize,
            elapsedSeconds: state.elapsedSeconds,
            lastTick: state.lastTick,
          },
        };
      }

      function loadUiState() {
        try {
          return JSON.parse(localStorage.getItem(uiStorageKey())) || {};
        } catch {
          return {};
        }
      }

      function loadAnswers() {
        try {
          return JSON.parse(localStorage.getItem(storageKey())) || {};
        } catch {
          return {};
        }
      }

      function applyUiState(uiState = {}) {
        state.setId = validSetId(uiState.setId);
        state.mode = validMode(uiState.mode);
        state.index = Number.isInteger(uiState.index) ? uiState.index : 0;
        state.examGraded = uiState.examGraded || {};
        state.randomGraded = Boolean(uiState.randomGraded);
        state.randomRefs = Array.isArray(uiState.randomRefs)
          ? uiState.randomRefs
          : [];
        state.reviewRetake = uiState.reviewRetake || {};
        state.reviewIds = uiState.reviewIds || {};
        state.navCollapsed = Boolean(uiState.navCollapsed);
        state.sidebarCollapsed = uiState.sidebarCollapsed !== false;
        state.fontSize = validFontSize(uiState.fontSize);
        state.elapsedSeconds = Number.isFinite(uiState.elapsedSeconds)
          ? uiState.elapsedSeconds
          : Number.isFinite(uiState.startedAt)
            ? Math.max(0, (Date.now() - uiState.startedAt) / 1000)
            : 0;
        state.lastTick = Date.now();
        state.answers = loadAnswers();
        state.histories = sanitizeHistories(uiState.histories);
      }

      function switchProduct(product) {
        if (!productData[product]) return;
        saveAnswers();
        saveUiState();
        activeProduct = product;
        data = productData[activeProduct];
        saveLastProduct();
        applyUiState(loadUiState());
        state.setId = validSetId(state.setId);
        lastRenderedQuestionKey = "";
        feedbackExpanded = false;
        renderExamSelect();
        renderMode();
        render();
      }

      function startProduct(product) {
        switchProduct(product);
        if (isAnswerLocked() || currentQuestions().length === 0) {
          state.mode = "practice";
          state.index = 0;
          setExamGraded(false);
          setRandomGraded(false);
          setReviewRetake(false);
          state.setId = validSetId(state.setId);
          lastRenderedQuestionKey = "";
          renderExamSelect();
          renderMode();
          render();
        }
      }

      function updateProductChrome() {
        if (productSubtitle) productSubtitle.textContent = productLabels[activeProduct];
        if (productTitle) {
          productTitle.textContent =
            activeProduct === "csts" ? "CSTS 문제풀이" : "샘플문제 풀이";
        }
        if (appShell) {
          appShell.setAttribute(
            "aria-label",
            `${productLabels[activeProduct]} 문제풀이 앱`,
          );
        }
      }

      function currentDataError() {
        return questionDataErrors[activeProduct] || "";
      }

      function saveAnswers() {
        try {
          localStorage.setItem(storageKey(), JSON.stringify(state.answers));
        } catch {
        }
        savePersistentSnapshot();
      }

      function saveUiState() {
        const uiState = buildSnapshot().uiState;
        try {
          localStorage.setItem(uiStorageKey(), JSON.stringify(uiState));
        } catch {
        }
        savePersistentSnapshot();
      }

      function openPersistenceDb() {
        if (!("indexedDB" in window)) return Promise.resolve(null);
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve) => {
          const request = indexedDB.open("istqb-fl-v4-sample-db", 1);
          request.onupgradeneeded = () =>
            request.result.createObjectStore("snapshots");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
          request.onblocked = () => resolve(null);
        });
        return dbPromise;
      }

      async function savePersistentSnapshot() {
        const snapshot = buildSnapshot();
        try {
          localStorage.setItem(persistenceKey(), JSON.stringify(snapshot));
        } catch {
        }
        const db = await openPersistenceDb();
        if (!db) return;
        try {
          const transaction = db.transaction("snapshots", "readwrite");
          transaction.objectStore("snapshots").put(snapshot, "latest");
        } catch {
        }
      }

      async function restorePersistentSnapshot() {
        let snapshot = null;
        let hasUiState = false;
        try {
          snapshot = JSON.parse(localStorage.getItem(persistenceKey()));
          hasUiState = Boolean(localStorage.getItem(uiStorageKey()));
        } catch {
          snapshot = null;
        }
        const db = await openPersistenceDb();
        if (db) {
          try {
            snapshot = await new Promise((resolve) => {
              const transaction = db.transaction("snapshots", "readonly");
              const request = transaction
                .objectStore("snapshots")
                .get("latest");
              request.onsuccess = () => resolve(request.result || snapshot);
              request.onerror = () => resolve(snapshot);
            });
          } catch {
          }
        }
        if (!snapshot || typeof snapshot !== "object") return;
        if (snapshot.answers && Object.keys(state.answers).length === 0) {
          state.answers = sanitizeAnswerState(snapshot.answers);
        }
        if (snapshot.uiState && !hasUiState) {
          applyBackupSnapshot({
            answers: state.answers,
            uiState: snapshot.uiState,
          });
        }
        renderExamSelect();
        renderMode();
        render();
      }

      function backupFileName() {
        const stamp = new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/[-:T]/g, "");
        return `${activeProduct}-fl-backup-${stamp}.json`;
      }

      function setBackupStatus(message, type = "") {
        if (!backupStatus) return;
        backupStatus.textContent = message;
        backupStatus.classList.toggle("success", type === "success");
        backupStatus.classList.toggle("error", type === "error");
      }

      function hideAppStatus() {
        if (!appStatus) return;
        appStatus.hidden = true;
        appStatus.replaceChildren();
      }

      function showAppStatus(type, titleText, descriptionText, actionText, action) {
        if (!appStatus) return;
        appStatus.hidden = false;
        appStatus.className = `app-status ${type === "error" ? "error-state" : "empty-state"}`;
        appStatus.setAttribute("role", type === "error" ? "alert" : "status");
        appStatus.replaceChildren();

        const title = document.createElement("h3");
        title.textContent = titleText;
        const description = document.createElement("p");
        description.textContent = descriptionText;
        appStatus.append(title, description);

        if (actionText && typeof action === "function") {
          const button = document.createElement("button");
          button.type = "button";
          button.className = type === "error" ? "danger" : "primary";
          button.textContent = actionText;
          button.addEventListener("click", action);
          appStatus.appendChild(button);
        }
      }

      function getFocusableElements(container) {
        return Array.from(
          container.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => !element.disabled && !element.hidden);
      }

      function openModal(modal, fallbackFocus) {
        if (!modal) return;
        lastModalTrigger = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
        modal.hidden = false;
        document.body.classList.add("modal-open");
        const [firstFocus] = getFocusableElements(modal);
        (fallbackFocus || firstFocus || modal).focus?.();
      }

      function closeModal(modal, onClose) {
        if (!modal || modal.hidden) return;
        modal.hidden = true;
        if (typeof onClose === "function") onClose();
        if (![figureModal, wrongNoteModal, backupImportModal, consoleLogModal].some((item) => item && !item.hidden)) {
          document.body.classList.remove("modal-open");
        }
        if (lastModalTrigger && typeof lastModalTrigger.focus === "function") {
          lastModalTrigger.focus();
        }
        lastModalTrigger = null;
      }

      function activeModal() {
        return [figureModal, wrongNoteModal, backupImportModal, consoleLogModal].find(
          (modal) => modal && !modal.hidden,
        );
      }

      function showProductGate() {
        saveAnswers();
        saveUiState();
        clearLastProduct();
        productGate?.classList.remove("is-product-hidden");
        productGate?.removeAttribute("hidden");
        appShell?.classList.add("is-product-hidden");
        sidebarBackdrop?.classList.remove("visible");
        document.body.style.overflow = "";
        openIstqbBtn?.focus();
      }

      function showActiveProductApp() {
        productGate?.classList.add("is-product-hidden");
        productGate?.setAttribute("hidden", "");
        appShell?.classList.remove("is-product-hidden");
      }

      function openIstqbApp() {
        startProduct("istqb");
        showActiveProductApp();
        questionTitle?.focus?.();
      }

      function openCstsApp() {
        startProduct("csts");
        showActiveProductApp();
        questionTitle?.focus?.();
      }

      function backupExportMessage(fileName, method) {
        if (method === "share") {
          return [
            "기록 내보내기를 완료했습니다.",
            `파일명: ${fileName}`,
            "확인 위치: 공유 화면에서 선택한 앱 또는 폴더",
          ].join("\n");
        }
        if (method === "clipboard") {
          return [
            "파일 저장을 열 수 없어 백업 JSON을 클립보드에 복사했습니다.",
            `파일명: ${fileName}`,
            "확인 위치: 클립보드",
          ].join("\n");
        }
        return [
          "기록 저장을 요청했습니다.",
          `파일명: ${fileName}`,
          "확인 위치: Android 파일 앱 > 다운로드(Download) 폴더",
        ].join("\n");
      }

      function androidBackupBridge() {
        return window.AndroidBackup &&
          typeof window.AndroidBackup.saveBackup === "function"
          ? window.AndroidBackup
          : null;
      }

      function saveBackupWithAndroid(fileName, payload) {
        const bridge = androidBackupBridge();
        if (!bridge) return null;
        try {
          const result = JSON.parse(bridge.saveBackup(fileName, payload));
          if (!result.ok)
            throw new Error(result.error || "Android 저장에 실패했습니다.");
          return result;
        } catch (error) {
          throw new Error(
            error.message ||
              "Android 다운로드 폴더에 백업을 저장하지 못했습니다.",
          );
        }
      }

      function saveTextWithAndroid(fileName, payload) {
        const bridge = androidBackupBridge();
        if (!bridge) return null;
        try {
          const result = JSON.parse(bridge.saveBackup(fileName, payload));
          if (!result.ok)
            throw new Error(result.error || "Android 저장에 실패했습니다.");
          return result;
        } catch (error) {
          throw new Error(
            error.message ||
              "Android 다운로드 폴더에 파일을 저장하지 못했습니다.",
          );
        }
      }

      function buildBackupPayload() {
        return {
          app: productLabels[activeProduct],
          schemaVersion: 1,
          exportedAt: new Date().toISOString(),
          questionTotal: allQuestions().length,
          snapshot: buildSnapshot(),
        };
      }

      async function exportBackup() {
        setBackupStatus(
          "기록 내보내기를 준비하고 있습니다. 완료 후 파일명과 확인 위치를 표시합니다.",
        );
        const payload = JSON.stringify(buildBackupPayload(), null, 2);
        const fileName = backupFileName();
        const blob = new Blob([payload], { type: "application/json" });

        try {
          const androidResult = saveBackupWithAndroid(fileName, payload);
          if (androidResult) {
            setBackupStatus(
              [
                "기록 저장을 완료했습니다.",
                `파일명: ${androidResult.fileName || fileName}`,
                `확인 위치: ${androidResult.location || "Android 파일 앱 > 다운로드(Download) 폴더"}`,
              ].join("\n"),
              "success",
            );
            return;
          }
        } catch (error) {
          setBackupStatus(
            `${error.message}\n공유 또는 브라우저 다운로드 방식으로 다시 시도합니다.`,
            "error",
          );
        }

        try {
          if (
            typeof File !== "undefined" &&
            navigator.canShare &&
            navigator.share
          ) {
            const file = new File([blob], fileName, {
              type: "application/json",
            });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: `${productLabels[activeProduct]} 풀이 기록 백업`,
              });
              setBackupStatus(
                backupExportMessage(fileName, "share"),
                "success",
              );
              return;
            }
          }
        } catch (error) {
          if (error.name === "AbortError") {
            setBackupStatus("기록 내보내기를 취소했습니다.");
            return;
          }
        }

        try {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          setBackupStatus(backupExportMessage(fileName, "download"), "success");
        } catch {
          try {
            await navigator.clipboard.writeText(payload);
            setBackupStatus(
              backupExportMessage(fileName, "clipboard"),
              "success",
            );
          } catch {
            setBackupStatus(
              "기록 내보내기에 실패했습니다. 앱 권한 또는 브라우저 다운로드 설정을 확인하세요.",
              "error",
            );
          }
        }
      }

      function consoleLogFileName() {
        const stamp = new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/[-:T]/g, "");
        return `${activeProduct}-fl-console-${stamp}.txt`;
      }

      function setConsoleLogStatus(message, type = "") {
        if (!consoleLogStatus) return;
        consoleLogStatus.textContent = message;
        consoleLogStatus.classList.toggle("success", type === "success");
        consoleLogStatus.classList.toggle("error", type === "error");
      }

      function buildConsoleLogText() {
        const questions = currentQuestions();
        const question = questions[state.index];
        const context = [
          `${productLabels[activeProduct]} Console Log`,
          `generatedAt: ${new Date().toISOString()}`,
          `url: ${window.location.href}`,
          `userAgent: ${navigator.userAgent}`,
          `set: ${currentSet().title} (${state.setId})`,
          `mode: ${modeLabel()}`,
          `questionIndex: ${state.index + 1} / ${questions.length}`,
          question ? `question: ${question.number}` : "question: none",
          "",
          "Logs:",
        ];
        return [...context, appLogStore.text()].join("\n");
      }

      function renderConsoleLog() {
        const errorCount = appLogStore.entries.filter(
          (entry) => entry.level === "error",
        ).length;
        const warnCount = appLogStore.entries.filter(
          (entry) => entry.level === "warn",
        ).length;
        consoleLogMeta.textContent = [
          `수집 로그 ${appLogStore.entries.length}개`,
          `에러 ${errorCount}개`,
          `경고 ${warnCount}개`,
        ].join(" · ");
        consoleLogText.textContent = buildConsoleLogText();
      }

      function openConsoleLog() {
        renderConsoleLog();
        setConsoleLogStatus("");
        openModal(consoleLogModal, consoleLogCloseBtn);
      }

      function closeConsoleLog() {
        closeModal(consoleLogModal);
      }

      async function copyConsoleLog() {
        try {
          await navigator.clipboard.writeText(buildConsoleLogText());
          setConsoleLogStatus("콘솔 로그를 클립보드에 복사했습니다.", "success");
        } catch {
          setConsoleLogStatus(
            "클립보드 복사에 실패했습니다. 파일 저장/공유를 사용해 주세요.",
            "error",
          );
        }
      }

      async function exportConsoleLog() {
        const payload = buildConsoleLogText();
        const fileName = consoleLogFileName();
        const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });

        try {
          const androidResult = saveTextWithAndroid(fileName, payload);
          if (androidResult) {
            setConsoleLogStatus(
              [
                "콘솔 로그 저장을 완료했습니다.",
                `파일명: ${androidResult.fileName || fileName}`,
                `확인 위치: ${
                  androidResult.location ||
                  "Android 파일 앱 > 다운로드(Download) 폴더"
                }`,
              ].join("\n"),
              "success",
            );
            return;
          }
        } catch (error) {
          setConsoleLogStatus(
            `${error.message}\n공유 또는 브라우저 다운로드 방식으로 다시 시도합니다.`,
            "error",
          );
        }

        try {
          if (
            typeof File !== "undefined" &&
            navigator.canShare &&
            navigator.share
          ) {
            const file = new File([blob], fileName, {
              type: "text/plain",
            });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: `${productLabels[activeProduct]} 콘솔 로그`,
              });
              setConsoleLogStatus(
                `콘솔 로그 공유를 요청했습니다.\n파일명: ${fileName}`,
                "success",
              );
              return;
            }
          }
        } catch (error) {
          if (error.name === "AbortError") {
            setConsoleLogStatus("콘솔 로그 공유를 취소했습니다.");
            return;
          }
        }

        try {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          setConsoleLogStatus(
            `콘솔 로그 저장을 요청했습니다.\n파일명: ${fileName}`,
            "success",
          );
        } catch {
          await copyConsoleLog();
        }
      }

      function clearConsoleLog() {
        if (!window.confirm("수집된 콘솔 로그를 비울까요?")) return;
        appLogStore.clear();
        renderConsoleLog();
        setConsoleLogStatus("콘솔 로그를 비웠습니다.", "success");
      }

      function readBackupFile(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () =>
            reject(new Error("백업 파일을 읽을 수 없습니다."));
          reader.readAsText(file);
        });
      }

      function isPlainObject(value) {
        return (
          Boolean(value) && typeof value === "object" && !Array.isArray(value)
        );
      }

      function sanitizeAnswerState(value) {
        const result = {};
        if (!isPlainObject(value)) return result;
        Object.entries(value).forEach(([key, choices]) => {
          if (!Array.isArray(choices)) return;
          const filtered = choices.filter((choice) => /^[a-e]$/.test(choice));
          if (filtered.length > 0) result[key] = filtered;
        });
        return result;
      }

      function sanitizeBooleanRecord(value) {
        const result = {};
        if (!isPlainObject(value)) return result;
        data.sets.forEach((set) => {
          if (Object.prototype.hasOwnProperty.call(value, set.id))
            result[set.id] = Boolean(value[set.id]);
        });
        return result;
      }

      function sanitizeReviewIds(value) {
        const result = {};
        if (!isPlainObject(value)) return result;
        data.sets.forEach((set) => {
          const ids = Array.isArray(value[set.id]) ? value[set.id] : [];
          result[set.id] = ids.filter(
            (number) => Number.isInteger(number) && number > 0,
          );
        });
        return result;
      }

      function sanitizeRandomRefs(value) {
        if (!Array.isArray(value)) return [];
        return value
          .filter(
            (ref) =>
              isPlainObject(ref) &&
              validSetId(ref.setId) === ref.setId &&
              Number.isInteger(ref.number),
          )
          .map((ref) => ({ setId: ref.setId, number: ref.number }));
      }

      function sanitizeHistories(value) {
        if (!Array.isArray(value)) return [];
        return value
          .filter((history) => isPlainObject(history))
          .map((history) => {
            // Histories saved in "review" mode stored their answers under the
            // "exam" answer key, so normalize them to "exam" to keep the saved
            // key and the lookup key (answerKey(question, history.mode)) aligned.
            const mode = history.mode === "random" ? "random" : "exam";
            const setId =
              mode === "random" ? "random" : validSetId(history.setId);
            const timestamp = Number.isFinite(history.timestamp)
              ? history.timestamp
              : Date.now();
            const id = String(history.id || timestamp);
            return {
              id,
              timestamp,
              mode,
              setId,
              answers: sanitizeAnswerState(history.answers),
              randomRefs:
                mode === "random" ? sanitizeRandomRefs(history.randomRefs) : null,
            };
          })
          .slice(-30);
      }

      function extractBackupSnapshot(payload) {
        if (!isPlainObject(payload))
          throw new Error("백업 JSON 형식이 올바르지 않습니다.");
        const snapshot = isPlainObject(payload.snapshot)
          ? payload.snapshot
          : payload;
        if (
          !isPlainObject(snapshot.answers) ||
          !isPlainObject(snapshot.uiState)
        ) {
          throw new Error("풀이 기록 백업 파일이 아닙니다.");
        }
        return snapshot;
      }

      function summarizeBackup(snapshot, payload = {}) {
        const uiState = snapshot.uiState || {};
        const set =
          data.sets.find((item) => item.id === uiState.setId) || data.sets[0];
        const mode = validMode(uiState.mode);
        const answers = sanitizeAnswerState(snapshot.answers);
        const answerCount = Object.keys(answers).length;
        const questionCount = Number.isFinite(payload.questionTotal)
          ? payload.questionTotal
          : allQuestions().length;
        const exportedAt = payload.exportedAt
          ? new Date(payload.exportedAt)
          : null;
        return {
          setTitle: set.title,
          modeLabel: modeLabel(mode),
          index: Number.isInteger(uiState.index) ? uiState.index + 1 : 1,
          answerCount,
          questionCount,
          exportedAtText:
            exportedAt && !Number.isNaN(exportedAt.getTime())
              ? exportedAt.toLocaleString()
              : "알 수 없음",
        };
      }

      function applyBackupSnapshot(snapshot) {
        const uiState = snapshot.uiState;
        state.answers = sanitizeAnswerState(snapshot.answers);
        state.setId = validSetId(uiState.setId);
        state.mode = validMode(uiState.mode);
        state.index =
          Number.isInteger(uiState.index) && uiState.index >= 0
            ? uiState.index
            : 0;
        state.examGraded = sanitizeBooleanRecord(uiState.examGraded);
        state.randomGraded = Boolean(uiState.randomGraded);
        state.randomRefs = sanitizeRandomRefs(uiState.randomRefs);
        state.reviewRetake = sanitizeBooleanRecord(uiState.reviewRetake);
        state.reviewIds = sanitizeReviewIds(uiState.reviewIds);
        state.histories = sanitizeHistories(uiState.histories);
        state.navCollapsed = Boolean(uiState.navCollapsed);
        state.sidebarCollapsed = uiState.sidebarCollapsed !== false;
        state.fontSize = validFontSize(uiState.fontSize);
        state.elapsedSeconds = Number.isFinite(uiState.elapsedSeconds)
          ? uiState.elapsedSeconds
          : Number.isFinite(uiState.startedAt)
            ? Math.max(0, (Date.now() - uiState.startedAt) / 1000)
            : 0;
        state.lastTick = Date.now();
      }

      async function importBackup(file) {
        if (!file) return;
        setBackupStatus(`${file.name} 내용을 확인하고 있습니다.`);
        try {
          const text = await readBackupFile(file);
          const payload = JSON.parse(text);
          const snapshot = extractBackupSnapshot(payload);
          openBackupImportSummary(snapshot, payload);
          setBackupStatus(
            "가져올 기록을 확인했습니다. 요약 모달에서 적용 여부를 선택하세요.",
            "success",
          );
        } catch (error) {
          setBackupStatus(
            "기록 가져오기에 실패했습니다. JSON 백업 파일인지 확인하세요.",
            "error",
          );
          window.alert(error.message || "백업 파일을 불러오지 못했습니다.");
        }
      }

      function openBackupImportSummary(snapshot, payload) {
        pendingBackupSnapshot = snapshot;
        pendingBackupPayload = payload;
        const summary = summarizeBackup(snapshot, payload);
        backupImportBody.replaceChildren();

        const info = document.createElement("div");
        info.className = "wrong-note-list";
        [
          ["저장 시각", summary.exportedAtText],
          ["문제 세트", summary.setTitle],
          ["풀이 모드", summary.modeLabel],
          ["현재 위치", `문제 ${summary.index}`],
          ["저장 답안", `${summary.answerCount}개`],
          ["백업 기준 문항", `${summary.questionCount}문항`],
        ].forEach(([label, value]) => {
          const row = document.createElement("div");
          row.className = "wrong-note-item";
          const meta = document.createElement("span");
          meta.className = "wrong-note-meta";
          meta.textContent = label;
          const text = document.createElement("p");
          text.className = "wrong-note-text";
          text.textContent = value;
          row.append(meta, text);
          info.appendChild(row);
        });

        const actions = document.createElement("div");
        actions.className = "record-actions";
        const apply = document.createElement("button");
        apply.type = "button";
        apply.className = "primary";
        apply.textContent = "이 기록 가져오기";
        apply.addEventListener("click", confirmBackupImport);
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "취소";
        cancel.addEventListener("click", closeBackupImport);
        actions.append(apply, cancel);
        backupImportBody.append(info, actions);
        openModal(backupImportModal, apply);
      }

      function closeBackupImport() {
        closeModal(backupImportModal, () => {
          backupImportBody.replaceChildren();
          pendingBackupSnapshot = null;
          pendingBackupPayload = null;
        });
      }

      function confirmBackupImport() {
        if (!pendingBackupSnapshot) return;
        applyBackupSnapshot(pendingBackupSnapshot);
        saveAnswers();
        saveUiState();
        renderExamSelect();
        renderMode();
        render();
        closeBackupImport();
        setBackupStatus("기록 가져오기를 완료했습니다.", "success");
        window.alert("풀이 기록을 불러왔습니다.");
      }

      function answerKey(question, mode = answerMode()) {
        if (question.id) return `${question.id}-${mode}`;
        return legacyAnswerKey(question, mode);
      }

      function legacyAnswerKey(question, mode = answerMode()) {
        const setId = question.legacySetId || question.setId || state.setId;
        return `${setId}-${mode}-${question.number}`;
      }

      function answerMode() {
        return state.mode === "review" ? "exam" : state.mode;
      }

      function selectedFor(question, mode = answerMode()) {
        const current = answerKey(question, mode);
        const legacy = legacyAnswerKey(question, mode);
        return state.answers[current] || state.answers[legacy] || [];
      }

      function sameChoices(left, right) {
        return [...left].sort().join(",") === [...right].sort().join(",");
      }

      function normalizeTextAnswer(value) {
        return String(value || "")
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase();
      }

      function isCorrect(question, mode = answerMode()) {
        if (question.type === "short_answer") {
          return (
            normalizeTextAnswer(selectedFor(question, mode)[0]) ===
            normalizeTextAnswer(question.answer[0])
          );
        }
        return sameChoices(selectedFor(question, mode), question.answer);
      }

      function isExamGraded() {
        return Boolean(state.examGraded[state.setId]);
      }

      function setExamGraded(value) {
        state.examGraded[state.setId] = value;
      }

      function isRandomGraded() {
        return Boolean(state.randomGraded);
      }

      function setRandomGraded(value) {
        state.randomGraded = value;
      }

      function isReviewRetake() {
        return Boolean(state.reviewRetake[state.setId]);
      }

      function setReviewRetake(value) {
        state.reviewRetake[state.setId] = value;
      }

      function resetAnswersFor(mode) {
        const questions =
          mode === "random" ? randomQuestions() : currentSet().questions;
        questions.forEach(
          (question) => {
            delete state.answers[answerKey(question, mode)];
            delete state.answers[legacyAnswerKey(question, mode)];
          },
        );
      }

      function unansweredCount(mode = answerMode()) {
        const questions =
          mode === "random" ? randomQuestions() : currentSet().questions;
        return questions.filter(
          (question) => selectedFor(question, mode).length === 0,
        ).length;
      }

      function missedExamQuestions() {
        return currentSet().questions.filter(
          (question) => !isCorrect(question, "exam"),
        );
      }

      function missedRandomQuestions() {
        return randomQuestions().filter(
          (question) => !isCorrect(question, "random"),
        );
      }

      function formatChoice(choices) {
        if (!Array.isArray(choices)) return String(choices || "");
        return choices.map((choice) => choice.toUpperCase()).join(", ");
      }

      function figureFor(question) {
        if (question.figure) return question.figure;
        const setId = question.setId || state.setId;
        const sampleCode = String(setId || "").split("-").pop();
        const key = `${sampleCode}${question.number}`;
        const figures = {
          A23: "figures/A23.png",
          B23: "figures/B23.png",
          C23: "figures/C23.png",
          C24: "figures/C24.png",
          C31: "figures/C31.png",
          C32: "figures/C32.png",
        };
        return figures[key] || "";
      }

      function renderFigure(question) {
        const src = figureFor(question);
        questionFigure.replaceChildren();
        questionFigure.hidden = !src;
        if (!src) return;

        const image = document.createElement("img");
        image.src = src;
        image.alt = `문제 ${question.number} 그림`;
        image.loading = "lazy";
        image.draggable = false;
        image.addEventListener("click", () => openFigureModal(src, image.alt));
        const zoomBtn = document.createElement("button");
        zoomBtn.type = "button";
        zoomBtn.className = "figure-zoom-btn";
        zoomBtn.innerHTML = "🔍 확대보기";
        zoomBtn.title = "그림 확대보기";
        zoomBtn.addEventListener("click", () =>
          openFigureModal(src, image.alt),
        );

        const wrapper = document.createElement("div");
        wrapper.className = "figure-scroll-wrapper";
        wrapper.appendChild(image);

        questionFigure.append(wrapper, zoomBtn);
      }

      function openFigureModal(src, alt) {
        figureModalBody.replaceChildren();
        const image = document.createElement("img");
        image.src = src;
        image.alt = alt;
        image.draggable = false;
        figureModalBody.appendChild(image);
        openModal(figureModal, figureModalCloseBtn);
      }

      function closeFigureModal() {
        closeModal(figureModal, () => {
          figureModalBody.replaceChildren();
        });
      }

      function modeLabel(mode = state.mode) {
        return (
          {
            practice: "연습",
            exam: "시험",
            random: "랜덤",
            review: "오답",
          }[mode] || "현재"
        );
      }

      function renderExamSelect() {
        if (!data.sets.length) {
          examSelect.replaceChildren();
          examSelect.disabled = true;
          return;
        }
        const setOptions = data.sets.map((set) => {
          const option = document.createElement("option");
          option.value = set.id;
          option.textContent = set.title;
          return option;
        });
        examSelect.replaceChildren(...setOptions);
        examSelect.value = state.setId;
      }

      function renderMode() {
        document.querySelectorAll("[data-mode]").forEach((button) => {
          const isActive = button.dataset.mode === state.mode;
          button.classList.toggle("active", isActive);
          button.setAttribute("aria-pressed", String(isActive));
        });
        examSelect.disabled = state.mode === "random" || !data.sets.length;
      }

      function renderVisualControls() {
        const sizes = { small: "17px", normal: "19px", large: "21px" };
        document.documentElement.style.setProperty(
          "--question-font-size",
          sizes[state.fontSize] || sizes.normal,
        );
        document.querySelectorAll("[data-font-size]").forEach((button) => {
          const isActive = button.dataset.fontSize === state.fontSize;
          button.classList.toggle("active", isActive);
          button.setAttribute("aria-pressed", String(isActive));
        });
      }

      function renderSidebarSummary() {
        const questions =
          state.mode === "review" || state.mode === "random"
            ? currentQuestions()
            : currentSet().questions;
        const answered = questions.filter(
          (question) => selectedFor(question).length,
        ).length;
        sidebar.classList.toggle("mobile-collapsed", state.sidebarCollapsed);
        const sidebarToggleLabel = state.sidebarCollapsed
          ? "설정 펼치기"
          : "설정 접기";
        sidebarToggleBtn.textContent = "⚙";
        sidebarToggleBtn.setAttribute("aria-label", sidebarToggleLabel);
        sidebarToggleBtn.title = sidebarToggleLabel;
        sidebarToggleBtn.setAttribute(
          "aria-expanded",
          String(!state.sidebarCollapsed),
        );
        mobileSetText.textContent =
          state.mode === "random" ? "전체 랜덤" : currentSet().title;
        mobileProgressText.textContent = `${modeLabel()} · ${answered} / ${questions.length}`;
        mobileProgressBadge.textContent = `진행 ${answered} / ${questions.length}`;
      }

      function renderRichText(target, text, options = {}) {
        target.replaceChildren();
        const blocks = buildRichBlocks(text);
        blocks.forEach((block) => {
          if (options.plainContent) {
            renderPlainBlock(target, block);
            return;
          }
          if (block.type === "image") {
            target.appendChild(renderReferenceImage(block.src));
            return;
          }
          if (block.type === "note") {
          const noteNode = document.createElement("span");
          noteNode.className = "text-line note-line";
          noteNode.textContent = block.text;
          target.appendChild(noteNode);
          return;
        }
        if (block.type === "table") {
            target.appendChild(renderDataTable(block));
            return;
          }
          if (block.type === "code") {
            target.appendChild(renderCodeBlock(block.lines));
            return;
          }
          if (block.type === "list") {
            target.appendChild(renderStructuredList(block.items));
            return;
          }
          const line = block.text;
          if (isTableLikeLine(line)) {
            const tableBlock = document.createElement("span");
            tableBlock.className = "table-block";
            tableBlock.textContent = line;
            target.appendChild(tableBlock);
            return;
          }
          const lineNode = document.createElement("span");
          lineNode.className = "text-line";
          lineNode.textContent = line;
          target.appendChild(lineNode);
        });
      }

      function renderPlainBlock(target, block) {
        if (block.type === "image") {
          target.appendChild(renderReferenceImage(block.src));
          return;
        }
        if (block.type === "table") {
          target.appendChild(renderDataTable(block));
          return;
        }
        if (block.type === "code") {
          target.appendChild(renderCodeBlock(block.lines));
          return;
        }
        if (block.type === "list") {
          target.appendChild(renderPlainList(block.items));
          return;
        }
        appendPlainLine(target, block.text, {
          markPrompt: target.id === "questionStem" || block.type === "prompt",
          className: "",
        });
      }

      function renderPlainList(items) {
        const list = document.createElement("span");
        list.className = "plain-list";
        items.forEach((item) =>
          appendPlainLine(list, `${plainMarker(item.marker)} ${item.text}`),
        );
        return list;
      }

      function appendPlainLine(target, text, options = {}) {
        if (!String(text || "").trim()) return;
        splitDenseQuestionText(text).flatMap(splitFormulaIntro).forEach((part) => {
          const lineNode = document.createElement("span");
          lineNode.className = "text-line";
          if (options.className) lineNode.classList.add(options.className);
          if (options.markPrompt && isQuestionPromptLine(part)) {
            lineNode.classList.add("prompt-line");
          }
          if (isDenseDataLine(part)) lineNode.classList.add("dense-line");
          if (isFormulaLine(part)) lineNode.classList.add("formula-line");
          lineNode.textContent = normalizeFormulaDisplay(part);
          target.appendChild(lineNode);
        });
      }

      function splitDenseQuestionText(text) {
        return String(text || "")
          .replace(/\s+(?=TC\d+\s*:)/g, "\n")
          .replace(/\s+(?=AC\d+\s*:)/g, "\n")
          .replace(/(사용한다\.)\s+(?=(?:\b(?:E|A|AA|EE)|[𝐸𝐴]{1,2})\s*\()/g, "$1\n")
          .replace(/\s+(?=\b(?:E|A|AA|EE)\s*\([^)]*\)\s*=)/g, "\n")
          .replace(/\s+(?=[𝐸𝐴]{1,2}\s*\([^)]*\)\s*=)/g, "\n")
          .replace(/\s+([0-9]+)\s+(?=그래프는)/g, " / $1\n")
          .replace(/\s+(?=다음\s+중\b)/g, "\n")
          .replace(/\s+(?=다음과\s+같은\b)/g, "\n")
          .replace(/\s+(?=테스트\s+케이스로\b)/g, "\n")
          .replace(/\s+(?=그래프는\b)/g, "\n")
          .split("\n")
          .map((part) => part.trim())
          .filter(Boolean);
      }

      function splitFormulaIntro(text) {
        const value = String(text || "").trim();
        const index = value.search(/(?:\b(?:E|A|AA|EE)|[𝐸𝐴]{1,2})\s*\([^)]*\)\s*[=＝]/);
        if (index <= 24 || !/[=＝]/.test(value.slice(index))) return [value];
        return [value.slice(0, index).trim(), value.slice(index).trim()].filter(Boolean);
      }

      function isDenseDataLine(text) {
        const value = String(text || "");
        return /TC\d+\s*:/.test(value) || /AC\d+\s*:/.test(value);
      }

      function isFormulaLine(text) {
        const value = String(text || "");
        return (
          /\b(?:E|A|AA|EE)\s*\([^)]*\)\s*=/.test(value) ||
          /[𝐸𝐴]{1,2}\s*\([^)]*\)\s*=/.test(value)
        );
      }

      function normalizeFormulaDisplay(text) {
        const value = String(text || "");
        if (!isFormulaLine(value)) return value;
        return value.replace(/\s+([0-9]+)$/, " / $1");
      }

      function plainMarker(marker) {
        if (isBulletMarker(marker)) return "•";
        return /^(?:viii|vii|vi|iv|iii|ii|ix|x|v|i)\.$/i.test(marker)
          ? marker.toLowerCase()
          : marker;
      }

      function isQuestionPromptLine(text) {
        const value = String(text || "").trim();
        return (
          /[?？](?:\s*\([^)]*\))?$/.test(value) ||
          /고르시오\.$/.test(value) ||
          /^(다음 중|다음 예시 중|어느|어떤|가장|최소|최대)/.test(value)
        );
      }

      function isTableLikeLine(line) {
        return /\|/.test(line) || / {3,}/.test(line) || /\t/.test(line);
      }

      function formatReadableText(text) {
        return splitStructuralMarkers(
          splitKnownSectionHeadings(
            normalizeReadableCharacters(stripPdfNoise(text)),
          ),
        );
      }

      function splitStructuralMarkers(text) {
        return String(text || "")
          .replace(
            /(^|\s)(?=(?:\d+\.|[\u2022\uF06C\uF0A1\uF0A7\uF0B7])\s)/g,
            "$1\n",
          )
          .replace(/\s*(?=\b(?:viii|vii|vi|iv|iii|ii|ix|x|v|i)\.\s)/gi, "\n")
          .replace(/\s*(?=(?:Given:|When:|Then:|And:)\s)/g, "\n")
          .replace(
            /\s*\|\s*(?=(?:제목:|심각도:|우선순위:|환경:|설명:|재현 절차:|첨부파일:)\s*)/g,
            "\n",
          )
          .replace(/\s+(?=(?:다음 중\s|다음 중이\s|다음 중에서\s|다음 예시 중\s))/g, "\n")
          .replace(/\s+(?=다음 테스트\s)/g, "\n")
          .replace(/\s+(?=그래프는\s)/g, "\n")
          .replace(/\s+(?=테스트 스위트에 이미\s)/g, "\n")
          .replace(/\s+(?=3점 추정 기법을\s)/g, "\n")
          .replace(/\s+(?=(?:인수 조건:|AC\d+:)\s*)/g, "\n")
          .replace(
            /\s+(?=(?:결함 ID:|제목:|애플리케이션:|결함:|재현 절차:|심각도:|우선순위:|환경:|설명:|첨부파일:)\s*)/g,
            "\n",
          )
          .replace(/(^|\s)([a-e]\))\s+/g, "$1\n$2 ")
          .replace(
            /\s*(?=(?:당신은 다음과 같이 테스트 케이스 세트를 도출했다:|테스트 케이스로 달성한))/g,
            "\n",
          )
          .replace(
            /\s*(?=(?:리뷰 활동은 다음과 같다:|그리고 다음과 같은 완화 활동이 있다\.|다음 중 위|그리고 다음과 같은 완화 활동이 있다\\.|다음 중 위|다음 중 분석한|테스트 도구 분류는 다음과 같다:|구현된 기능은 다음과 같다:|사전 조건은 다음과 같다:))/g,
            "\n",
          )
          .replace(/\s+(?=그리고 다음과 같은 설명이 있다:)/g, "\n")
          .replace(
            /\s*(?=(?:환경 구성:|테스트 케이스 세트:|TC\d+\s+실행))/g,
            "\n",
          )
          .replace(/\s*(따라서:)/g, "\n$1")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }

      function normalizeReadableCharacters(text) {
        const roman = {
          Ⅰ: "I",
          Ⅱ: "II",
          Ⅲ: "III",
          Ⅳ: "IV",
          Ⅴ: "V",
          Ⅵ: "VI",
          Ⅶ: "VII",
          Ⅷ: "VIII",
          Ⅸ: "IX",
          Ⅹ: "X",
          ⅰ: "i",
          ⅱ: "ii",
          ⅲ: "iii",
          ⅳ: "iv",
          ⅴ: "v",
          ⅵ: "vi",
          ⅶ: "vii",
          ⅷ: "viii",
          ⅸ: "ix",
          ⅹ: "x",
        };
        return String(text || "").replace(
          /[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹ]/g,
          (value) => roman[value] || value,
        );
      }

      function splitKnownSectionHeadings(text) {
        const headings = [
          "당신은 다음과 같이 테스트 케이스 세트를 도출했다:",
          "테스트 케이스로 달성한",
          "다음과 같은 테스트 활동이 있다:",
          "그리고 다음과 같은 테스트 활동이 있다:",
          "다음과 같은 완화 활동이 있다.",
          "그리고 다음과 같은 완화 활동이 있다.",
          "다음 중 위",
          "다음 중 이",
          "다음 중 업무와",
          "다음 중 테스트",
          "어떤 테스트 케이스가",
        ];
        return headings.reduce(
          (value, heading) => value.replaceAll(heading, `\n${heading}`),
          text,
        );
      }

      function stripPdfNoise(text) {
        return String(text || "")
          .replace(/Korean Software Testing Qualifications Board[^\n]*/gi, "")
          .replace(
            /www\.kstqb\.org\s+I\s+info@kstqb\.org(?:\s+\d+\s+of\s+\d+)?/gi,
            "",
          )
          .replace(/www\.kstqb\.org\s*/gi, "")
          .replace(/info@kstqb\.org\s*/gi, "")
          .replace(/\b\d+\s+of\s+\d+\b/gi, "")
          .replace(/실\s+무/g, "실무")
          .replace(/수행\s+하고/g, "수행하고")
          .replace(/실행\s+하는/g, "실행하는")
          .replace(/제공\s+되었다/g, "제공되었다")
          .replace(/초과\s+하는/g, "초과하는")
          .replace(/포함\s+되어/g, "포함되어")
          .replace(/등록\s+하지/g, "등록하지")
          .replace(/유지\s+된다/g, "유지된다")
          .replace(/대출\s+되어/g, "대출되어")
          .replace(/처리\s+되며/g, "처리되며")
          .replace(/표시\s+되지/g, "표시되지")
          .replace(/할\s+인/g, "할인")
          .replace(/테스트 케이\s+스/g, "테스트 케이스")
          .replace(/케\s+이스/g, "케이스")
          .replace(/테\s+스트/g, "테스트")
          .replace(/테스\s+트/g, "테스트")
          .replace(/시\s+간/g, "시간")
          .replace(/나타\s+낸/g, "나타낸")
          .replace(/같\s+은/g, "같은")
          .replace(/요구사\s+항/g, "요구사항")
          .replace(/비\s+즈니스/g, "비즈니스")
          .replace(/컴포\s+넌트/g, "컴포넌트")
          .replace(/사\s+용자/g, "사용자")
          .replace(/두\((\d+)\)\s+개/g, "두($1)개")
          .replace(/\s{2,}/g, " ");
      }

      function plainQuestionText(value) {
        if (!Array.isArray(value)) return String(value || "");
        return value
          .map((block) => {
            if (!block || typeof block !== "object") return "";
            if (Array.isArray(block.items)) {
              return block.items
                .map((item) => (typeof item === "string" ? item : item.text || ""))
                .join(" ");
            }
            if (Array.isArray(block.lines)) return block.lines.join(" ");
            return block.text || "";
          })
          .filter(Boolean)
          .join(" ");
      }

      function buildRichBlocks(text) {
        if (Array.isArray(text)) {
          return text.flatMap((block) => normalizeQuestionBlock(block));
        }
        const cleaned = splitKnownSectionHeadings(
          normalizeReadableCharacters(stripPdfNoise(text)),
        );
        const formatted = normalizePseudoCodeBlocks(
          normalizeKnownTables(cleaned),
        );
        const lines = formatted
          .split("\n")
          .flatMap((line) =>
            line.startsWith("__TABLE__:") ||
              line.startsWith("__CODE__:") ||
              line.startsWith("__IMAGE__:")
              ? [line]
              : splitStructuralMarkers(line).split("\n"),
          )
          .map((line) => line.trim())
          .filter(Boolean);
        const blocks = [];
        let pendingList = [];

        const flushList = () => {
          if (pendingList.length > 0) {
            blocks.push({ type: "list", items: pendingList });
            pendingList = [];
          }
        };

        lines.forEach((line) => {
          if (line.startsWith("__TABLE__:")) {
            flushList();
            blocks.push({ type: "table", rows: JSON.parse(line.slice(10)) });
            return;
          }
          if (line.startsWith("__IMAGE__:")) {
            flushList();
            blocks.push({ type: "image", src: line.slice(10).trim() });
            return;
          }
          if (line.startsWith("__CODE__:")) {
            flushList();
            blocks.push({ type: "code", lines: JSON.parse(line.slice(9)) });
            return;
          }
          const listItem = parseStructuredItem(line);
          if (listItem) {
            if (pendingList.length > 0) {
              const prev = markerInfo(pendingList[pendingList.length - 1].marker);
              const cur = markerInfo(listItem.marker);
              if (prev.kind !== cur.kind || (cur.kind !== "bullet" && cur.order <= prev.order)) {
                flushList();
              }
            }
            pendingList.push(listItem);
            return;
          }
          flushList();
          blocks.push({ type: "text", text: line });
        });
        flushList();
        return blocks;
      }

      function normalizeQuestionBlock(block) {
        if (!block || typeof block !== "object") return [];
        const type = block.type || "paragraph";
        if (type === "image" && block.src) return [{ type: "image", src: block.src }];
        if (type === "table" && Array.isArray(block.rows)) {
          return [{ type: "table", rows: block.rows }];
        }
        if (type === "code") {
          const lines = Array.isArray(block.lines)
            ? block.lines
            : String(block.text || "").split("\n");
          return [{ type: "code", lines: lines.map(String).filter(Boolean) }];
        }
        if (type === "list" && Array.isArray(block.items)) {
          return [
            {
              type: "list",
              items: block.items.map((item, index) =>
                typeof item === "string"
                  ? { marker: `${index + 1}.`, text: item }
                  : { marker: item.marker || `${index + 1}.`, text: item.text || "" },
              ),
            },
          ];
        }
        const value = String(block.text || "").trim();
        if (!value) return [];
        if (["paragraph", "formula"].includes(type)) return buildRichBlocks(value);
        return [{ type, text: value }];
      }

      function parseStructuredItem(line) {
        const match = line.match(
          /^(\d+\.(?!\d)|\(\d+\)|[A-E]\.|[a-e]\)|[\uAC00-\uCC28]\.|(?:viii|vii|vi|iv|iii|ii|ix|x|v|i)\.|[\u2022\uF06C\uF0A1\uF0A7\uF0B7])\s*(.+)$/i,
        );
        if (!match) return null;
        return { marker: match[1], text: match[2].trim() };
      }

      function markerInfo(marker) {
        const m = String(marker).trim();
        if (/^\d+\.$/.test(m)) return { kind: "num", order: parseInt(m, 10) };
        if (/^\(\d+\)$/.test(m)) return { kind: "paren", order: parseInt(m.replace(/\D/g, ""), 10) };
        if (/^[A-Ea-e]\.$/.test(m)) return { kind: "alphadot", order: m.toLowerCase().charCodeAt(0) };
        if (/^[a-e]\)$/.test(m)) return { kind: "alphaparen", order: m.toLowerCase().charCodeAt(0) };
        if (/^[\uAC00-\uCC28]\.$/.test(m)) return { kind: "hangul", order: m.charCodeAt(0) };
        if (/^(?:viii|vii|vi|iv|iii|ii|ix|x|v|i)\.$/i.test(m)) {
          const map = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
          return { kind: "roman", order: map[m.replace(".", "").toLowerCase()] || 0 };
        }
        return { kind: "bullet", order: 0 };
      }

      function renderStructuredList(items) {
        const list = document.createElement("span");
        list.className = "structured-list";
        items.forEach((item) => {
          const row = document.createElement("span");
          row.className = "structured-line";
          const marker = document.createElement("span");
          marker.className = "structured-marker";
          marker.textContent = isBulletMarker(item.marker) ? "•" : item.marker;
          const body = document.createElement("span");
          body.textContent = item.text;
          row.append(marker, body);
          list.appendChild(row);
        });
        return list;
      }

      function renderCodeBlock(lines) {
        const block = document.createElement("span");
        block.className = "code-block";
        block.textContent = lines.join("\n");
        return block;
      }

      function renderReferenceImage(src) {
        const frame = document.createElement("div");
        frame.className = "reference-image-frame";
        const image = document.createElement("img");
        image.className = "reference-image";
        image.src = src;
        image.alt = "문제 참고 이미지";
        image.loading = "lazy";
        image.draggable = false;
        image.addEventListener("click", () => openFigureModal(src, image.alt));
        frame.appendChild(image);
        return frame;
      }

      function isBulletMarker(marker) {
        return /^[\u2022\uF06C\uF0A1\uF0A7\uF0B7]$/.test(marker);
      }

      function renderDataTable(block) {
        const wrapper = document.createElement("div");
        wrapper.className = "table-image-frame";
        const image = document.createElement("img");
        image.className = "table-image";
        image.src = tableSvgDataUrl(block.rows);
        image.alt = "문제 참고 표";
        image.loading = "lazy";
        image.draggable = false;
        image.addEventListener("click", () => openFigureModal(image.src, image.alt));
        wrapper.appendChild(image);
        return wrapper;
      }

      function tableSvgDataUrl(rows) {
        const normalizedRows = rows.map((row) =>
          row.map((cell) => String(cell || "")),
        );
        const columnCount = Math.max(...normalizedRows.map((row) => row.length), 1);
        const columns = Array.from({ length: columnCount }, (_, columnIndex) => {
          const longest = Math.max(
            ...normalizedRows.map((row) => visualLength(row[columnIndex] || "")),
            4,
          );
          return Math.min(Math.max(longest * 10 + 30, 78), 210);
        });
        const rowHeight = 42;
        const width = columns.reduce((sum, value) => sum + value, 0) + 2;
        const height = normalizedRows.length * rowHeight + 2;
        let y = 1;
        const body = normalizedRows
          .map((row, rowIndex) => {
            let x = 1;
            const cells = columns
              .map((columnWidth, columnIndex) => {
                const value = escapeSvg(row[columnIndex] || "");
                const fill = rowIndex === 0 ? "#e8efe7" : rowIndex % 2 ? "#ffffff" : "#fbfcfa";
                const weight = rowIndex === 0 ? 700 : 500;
                const cell = `
                  <rect x="${x}" y="${y}" width="${columnWidth}" height="${rowHeight}" fill="${fill}" stroke="#b9c6b8"/>
                  <text x="${x + columnWidth / 2}" y="${y + 26}" text-anchor="middle" font-size="15" font-weight="${weight}" fill="#1f2d24">${value}</text>
                `;
                x += columnWidth;
                return cell;
              })
              .join("");
            y += rowHeight;
            return cells;
          })
          .join("");
        const svg = `
          <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <rect width="100%" height="100%" fill="#ffffff"/>
            ${body}
          </svg>
        `;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      }

      function visualLength(value) {
        return Array.from(String(value || "")).reduce(
          (sum, char) => sum + (char.charCodeAt(0) > 255 ? 1.7 : 1),
          0,
        );
      }

      function escapeSvg(value) {
        return String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }

      function normalizeKnownTables(text) {
        return normalizePlanningPokerTable(
          normalizeSortLogTable(
            normalizeDecisionTable(
              normalizeTraceabilityMatrix(
                normalizeHotelTransitionTable(
                  normalizeDrivingDecisionTable(
                    normalizeClassificationDecisionTable(
                      normalizeArteryDecisionTable(
                        normalizeRestaurantPriorityTable(
                          normalizeExecutionHistoryTable(
                            normalizeTestPriorityTable(
                              normalizeFinalGradeTable(
                                normalizeProjectEffortTable(
                                  normalizeCstsIpoTable(
                                    normalizeTruthTable(
                                      normalizeChoiceClassTable(
                                        normalizeTrainingDecisionTable(text),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      }

      function normalizeCstsIpoTable(text) {
        const pattern =
          /입력 인자\s+A\s+B\s+C\s+값\s+A1\s+B1\s+C1\s+A2\s+B2\s+C2\s+A3\s+-\s+C3\s+테스트 케이스\s+A\s+B\s+C\s+A1\s+B1\s+C1\s+A1\s+B2\s+C2\s+A2\s+B1\s+C3\s+A2\s+B2\s+C1\s+A3\s+B1\s+C2\s+A3\s+B2\s+C3\s+A1\s+-\s+C3\s+A2\s+-\s+C2\s+\(\s*\)\s+-\s+\(\s*\)/;
        const match = text.match(pattern);
        if (!match) return text;
        const rows = [
          ["입력 인자", "A", "B", "C"],
          ["값", "A1", "B1", "C1"],
          ["", "A2", "B2", "C2"],
          ["", "A3", "-", "C3"],
          ["", "", "", ""],
          ["테스트 케이스", "A", "B", "C"],
          ["", "A1", "B1", "C1"],
          ["", "A1", "B2", "C2"],
          ["", "A2", "B1", "C3"],
          ["", "A2", "B2", "C1"],
          ["", "A3", "B1", "C2"],
          ["", "A3", "B2", "C3"],
          ["", "A1", "-", "C3"],
          ["", "A2", "-", "C2"],
          ["", "( )", "-", "( )"],
        ];
        return text.replace(match[0], `\n__TABLE__:${JSON.stringify(rows)}\n`);
      }

      function normalizeTrainingDecisionTable(text) {
        const pattern =
          /규칙\s+1\s+2\s+3\s+4\s+5\s+6\s+7\s+8\s+(?:조건|조\s+건)\s+B등급 이상\s+Y\s+Y\s+Y\s+Y\s+N\s+N\s+N\s+N\s+10년차 이상\s+Y\s+Y\s+N\s+N\s+Y\s+Y\s+N\s+N\s+공로상 수상\s+Y\s+N\s+Y\s+N\s+Y\s+N\s+Y\s+N\s+(?:행위|행\s+위)\s+프랑스\s+Y\s+Y\s+F\s+F\s+F\s+F\s+F\s+F\s+싱가포르\s+F\s+F\s+Y\s+Y\s+F\s+F\s+F\s+F\s+스페인\s+Y\s+F\s+Y\s+F\s+F\s+F\s+F\s+F/;
        const match = text.match(pattern);
        if (!match) return text;
        const rows = [
          ["", "규칙 1", "규칙 2", "규칙 3", "규칙 4", "규칙 5", "규칙 6", "규칙 7", "규칙 8"],
          ["조건: B등급 이상", "Y", "Y", "Y", "Y", "N", "N", "N", "N"],
          ["조건: 10년차 이상", "Y", "Y", "N", "N", "Y", "Y", "N", "N"],
          ["조건: 공로상 수상", "Y", "N", "Y", "N", "Y", "N", "Y", "N"],
          ["행위: 프랑스", "Y", "Y", "F", "F", "F", "F", "F", "F"],
          ["행위: 싱가포르", "F", "F", "Y", "Y", "F", "F", "F", "F"],
          ["행위: 스페인", "Y", "F", "Y", "F", "F", "F", "F", "F"],
        ];
        return text.replace(match[0], `\n__TABLE__:${JSON.stringify(rows)}\n`);
      }

      function normalizeChoiceClassTable(text) {
        const pattern =
          /목적지\s+등급\s+좌석\s+파리\s+퍼스트\s+창가\s+런던\s+비즈니스\s+통로\s+(?:(시드니)\s+)?이코노미/;
        const match = text.match(pattern);
        if (!match) return text;
        const rows = [
          ["입력 인자", "클래스 1", "클래스 2", "클래스 3"],
          ["목적지", "파리", "런던", match[1] || ""],
          ["등급", "퍼스트", "비즈니스", "이코노미"],
          ["좌석", "창가", "통로", ""],
        ];
        return text.replace(match[0], `\n__TABLE__:${JSON.stringify(rows)}\n`);
      }

      function normalizeTruthTable(text) {
        const pattern =
          /테스트 케이스 ID\s+A\s+B\s+A or B\s+\(가\)\s+T\s+T\s+T\s+\(나\)\s+T\s+F\s+T\s+\(다\)\s+F\s+T\s+T\s+\(라\)\s+F\s+F\s+F/;
        const match = text.match(pattern);
        if (!match) return text;
        const rows = [
          ["테스트 케이스 ID", "A", "B", "A or B"],
          ["(가)", "T", "T", "T"],
          ["(나)", "T", "F", "T"],
          ["(다)", "F", "T", "T"],
          ["(라)", "F", "F", "F"],
        ];
        return text.replace(match[0], `\n__TABLE__:${JSON.stringify(rows)}\n`);
      }

      function normalizePseudoCodeBlocks(text) {
        const pattern =
          /INPUT:\s*(.*?)\s+IF\s*\((.*?)\)\s+THEN\s+write\s+([“"][^”"]+[”"])\s+ELSE\s+write\s+([“"][^”"]+[”"])/i;
        const normalized = String(text || "").replace(
          pattern,
          (_, input, condition, thenValue, elseValue) => {
            const lines = [
              `INPUT: ${input.trim()}`,
              `IF (${condition.trim()})`,
              `THEN write ${thenValue.trim()}`,
              `ELSE write ${elseValue.trim()}`,
            ];
            return `\n__CODE__:${JSON.stringify(lines)}\n`;
          },
        );
        return normalizeGenericCodeBlocks(normalized);
      }

      function normalizeGenericCodeBlocks(text) {
        const lines = String(text || "").split("\n");
        const blocks = [];
        let codeLines = [];
        const isCodeLine = (line) => {
          const value = String(line || "").trim();
          return (
            /^[{}]$/.test(value) ||
            /[;{}]/.test(value) ||
            /^(?:int|void|float|double|char|boolean|String|if|else|return|for|while|switch|IF|ELSE|THEN|END|ENDIF|READ|PRINT)\b/.test(value) ||
            /^[A-Za-z_]\w*\s*=/.test(value)
          );
        };
        const flushCode = () => {
          blocks.push(
            ...(codeLines.length >= 3
              ? [`__CODE__:${JSON.stringify(codeLines)}`]
              : codeLines),
          );
          codeLines = [];
        };
        lines.forEach((line, index) => {
          const value = line.trim();
          const next = lines[index + 1]?.trim() || "";
          const numberedCodeLine =
            /^\d+$/.test(value) && (isCodeLine(next) || codeLines.length > 0);
          if (isCodeLine(value) || numberedCodeLine) {
            codeLines.push(value);
            return;
          }
          flushCode();
          blocks.push(line);
        });
        flushCode();
        return blocks.join("\n");
      }

      function normalizePlanningPokerTable(text) {
        const pattern =
          /(?:\ud300\uc6d0\ub4e4\uc758 \ucd94\uc815\s+)?1\s+\ub77c\uc6b4\ub4dc\s+((?:\d+\s+){6}\d+)\s+2\s+\ub77c\uc6b4\ub4dc\s+((?:\d+\s+){6}\d+)\s+3\s+\ub77c\uc6b4\ub4dc\s+((?:\d+\s+){6}\d+)/;
        const match = text.match(pattern);
        if (!match) return text;
        const rows = [
          [
            "\ub77c\uc6b4\ub4dc",
            "\ucd94\uc815 1",
            "\ucd94\uc815 2",
            "\ucd94\uc815 3",
            "\ucd94\uc815 4",
            "\ucd94\uc815 5",
            "\ucd94\uc815 6",
            "\ucd94\uc815 7",
          ],
        ];
        [1, 2, 3].forEach((round) => {
          rows.push([String(round), ...match[round].trim().split(/\s+/)]);
        });
        return text.replace(match[0], `\n__TABLE__:${JSON.stringify(rows)}\n`);
      }

      function normalizeExecutionHistoryTable(text) {
        const pattern =
          /첫 번째 실행\s+두 번째 실행\s+세 번째 실행\s+TC1\s+\((\d+)\)\s+(합격|실패)\s+\((\d+)\)\s+(합격|실패)\s+\((\d+)\)\s+(합격|실패)\s+TC2\s+\((\d+)\)\s+(합격|실패)\s+\((\d+)\)\s+(합격|실패)\s+\((\d+)\)\s+(합격|실패)\s+TC3\s+\((\d+)\)\s+(합격|실패)\s+\((\d+)\)\s+(합격|실패)\s+\((\d+)\)\s+(합격|실패)/;
        const match = text.match(pattern);
        if (!match) return text;
        const rows = [["TC", "첫 번째 실행", "두 번째 실행", "세 번째 실행"]];
        for (let row = 0; row < 3; row += 1) {
          const offset = row * 6 + 1;
          rows.push([
            `TC${row + 1}`,
            `(${match[offset]}) ${match[offset + 1]}`,
            `(${match[offset + 2]}) ${match[offset + 3]}`,
            `(${match[offset + 4]}) ${match[offset + 5]}`,
          ]);
        }
        return text.replace(match[0], "\n__IMAGE__:source-visuals/A14-execution-history.png\n");
      }

      function normalizeRestaurantPriorityTable(text) {
        const header = "번호 커버되는 테스트 컨디션 우선순위 논리적 종속성";
        const start = text.indexOf(header);
        if (start < 0) return text;
        const tail = text.slice(start + header.length);
        const pattern =
          /(TC\d{3})\s+(.+?)\s+(\d+)\s+(.+?)(?=\s+TC\d{3}\s+|다음 중|$)/g;
        const rows = [
          ["번호", "커버되는 테스트 컨디션", "우선순위", "논리적 종속성"],
        ];
        let match;
        let consumed = 0;
        while ((match = pattern.exec(tail))) {
          rows.push([match[1], match[2].trim(), match[3], match[4].trim()]);
          consumed = pattern.lastIndex;
        }
        if (rows.length < 3) return text;
        return `${text.slice(0, start).trim()}\n${header}\n__TABLE__:${JSON.stringify(rows)}\n${tail.slice(consumed).trim()}`;
      }

      function normalizeArteryDecisionTable(text) {
        const pattern =
          /규칙 1\s+규칙 2\s+규칙 3\s+규칙 4\s+규칙 5\s+조건\s+콜레스테롤\(mg\/dl\)\s+≤ 124\s+≤ 124\s+125 - 200\s+125-200\s+≥ 201\s+혈압\(mmHg\)\s+≤ 140\s+> 140\s+≤ 140\s+> 140\s+-\s+결과\s+위험 수준\s+매우 낮음\s+낮음\s+중간\s+높음\s+매우 높음/;
        const match = text.match(pattern);
        if (!match) return text;
        const rows = [
          ["항목", "규칙 1", "규칙 2", "규칙 3", "규칙 4", "규칙 5"],
          [
            "콜레스테롤(mg/dl)",
            "≤ 124",
            "≤ 124",
            "125 - 200",
            "125-200",
            "≥ 201",
          ],
          ["혈압(mmHg)", "≤ 140", "> 140", "≤ 140", "> 140", "-"],
          ["위험 수준", "매우 낮음", "낮음", "중간", "높음", "매우 높음"],
        ];
        return text.replace(match[0], "\n__IMAGE__:source-visuals/B22-artery-table.png\n");
      }

      function normalizeClassificationDecisionTable(text) {
        const pattern =
          /R1\s+R2\s+R3\s+R4\s+R5\s+R6\s+R7\s+C1:\s+나이\s+0-18\s+19-65\s+19-65\s+>65\s+0-18\s+19-65\s+>65\s+C2:\s+경험\s+-\s+0-4\s+>4\s+-\s+-\s+-\s+-\s+C3:\s+등록유무\s+NO\s+NO\s+NO\s+NO\s+YES\s+YES\s+YES\s+분류\s+A\s+A\s+B\s+B\s+B\s+D\s+C/;
        const match = text.match(pattern);
        if (!match) return text;
        const rows = [
          ["항목", "R1", "R2", "R3", "R4", "R5", "R6", "R7"],
          ["C1: 나이", "0-18", "19-65", "19-65", ">65", "0-18", "19-65", ">65"],
          ["C2: 경험", "-", "0-4", ">4", "-", "-", "-", "-"],
          ["C3: 등록유무", "NO", "NO", "NO", "NO", "YES", "YES", "YES"],
          ["분류", "A", "A", "B", "B", "B", "D", "C"],
        ];
        return text.replace(match[0], "\n__IMAGE__:source-visuals/D22-classification-table.png\n");
      }

      function normalizeDrivingDecisionTable(text) {
        const pattern =
          /R1\s+R2\s+R3\s+C1:\s+첫 시험 도전\?\s+-\s+-\s+F\s+C2:\s+이론 시험 합격\?\s+T\s+F\s+-\s+C3:\s+실기 시험 합격\?\s+T\s+-\s+F\s+운전 면허 발급\?\s+X\s+운전 강습 추가 요청\?\s+X\s+시험 재-응시 요청\?\s+X/;
        const match = text.match(pattern);
        if (!match) return text;
        const rows = [
          ["항목", "R1", "R2", "R3"],
          ["C1: 첫 시험 도전?", "-", "-", "F"],
          ["C2: 이론 시험 합격?", "T", "F", "-"],
          ["C3: 실기 시험 합격?", "T", "-", "F"],
          ["운전 면허 발급?", "X", "", ""],
          ["운전 강습 추가 요청?", "", "X", ""],
          ["시험 재-응시 요청?", "", "", "X"],
        ];
        return text.replace(match[0], "\n__IMAGE__:source-visuals/C22-driving-table.png\n");
      }

      function normalizeHotelTransitionTable(text) {
        const pattern =
          /이벤트\s+상태\s+예약 가능\s+예약 불가\s+객실 변경\s+취소\s+결제\s+S1:\s+요청 중\s+S2\s+S3\s+S2:\s+확인됨\s+S1\s+S4\s+S4\s+S3:\s+대기자 명단\s+S2\s+S4\s+S4:\s+종료/;
        const match = text.match(pattern);
        if (!match) return text;
        const rows = [
          ["상태", "예약 가능", "예약 불가", "객실 변경", "취소", "결제"],
          ["S1: 요청 중", "S2", "S3", "", "", ""],
          ["S2: 확인됨", "", "", "S1", "S4", "S4"],
          ["S3: 대기자 명단", "S2", "", "", "S4", ""],
          ["S4: 종료", "", "", "", "", ""],
        ];
        return text.replace(match[0], "\n__IMAGE__:source-visuals/D23-hotel-transition.png\n");
      }

      function normalizeTraceabilityMatrix(text) {
        const pattern =
          /Req 1\s+Req 2\s+Req 3\s+Req 4\s+Req 5\s+Req 6\s+Req 7\s+TC1\s+X\s+X\s+X\s+X\s+TC2\s+X\s+X\s+X\s+TC3\s+X\s+X\s+TC4\s+X/;
        const match = text.match(pattern);
        if (!match) return text;
        const rows = [
          ["TC", "Req 1", "Req 2", "Req 3", "Req 4", "Req 5", "Req 6", "Req 7"],
          ["TC1", "X", "", "X", "X", "", "", "X"],
          ["TC2", "X", "", "", "", "X", "", "X"],
          ["TC3", "", "", "", "X", "X", "", ""],
          ["TC4", "", "X", "", "", "", "", ""],
        ];
        return text.replace(match[0], "\n__IMAGE__:source-visuals/D32-traceability.png\n");
      }

      function normalizeDecisionTable(text) {
        if (!/조건\s+R1\s+R2\s+R3\s+R4\s+R5\s+R6\s+R7\s+R8/.test(text))
          return text;
        const pattern =
          /조건\s+R1\s+R2\s+R3\s+R4\s+R5\s+R6\s+R7\s+R8\s+회원\s+([TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF])\s+반납기한 경과\s+([TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF])\s+15회 대여\s+([TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF]\s+[TF])\s+결과\s+20% 할인\s+([\sX]*?)\s+티셔츠 선물\s+([\sX]*?)(?=\s+고객 관리|\s+다음 중|$)/;
        const match = text.match(pattern);
        if (!match) return text;
        const rules = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"];
        const rows = [
          ["항목", ...rules],
          ["회원", ...match[1].split(/\s+/)],
          ["반납기한 경과", ...match[2].split(/\s+/)],
          ["15회 대여", ...match[3].split(/\s+/)],
          ["20% 할인", "", "X", "", "X", "", "", "", ""],
          ["티셔츠 선물", "", "", "X", "X", "", "", "", "X"],
        ];
        return text.replace(match[0], "\n__IMAGE__:source-visuals/A22-decision-table.png\n");
      }

      function normalizeTestPriorityTable(text) {
        const header = "테스트 우선순위(1 = 가장 높은 우선순위)";
        const headerIndex = text.indexOf(header);
        if (headerIndex < 0) return text;

        const tail = text.slice(headerIndex + header.length);
        const rows = [["테스트 케이스", "설명", "우선순위"]];
        const pattern = /TC(\d+)\s+(.+?)\s+(\d+)(?=\s+TC\d+\s+|\s+또한|또한|$)/g;
        let match;
        let consumed = 0;
        while ((match = pattern.exec(tail))) {
          rows.push([`TC${match[1]}`, match[2].trim(), match[3]]);
          consumed = pattern.lastIndex;
        }
        if (rows.length < 3) return text;

        const before = text.slice(0, headerIndex);
        const after = tail.slice(consumed).trim();
        return `${before.trim()}\n${header}\n__IMAGE__:source-visuals/B32-test-priority.png\n${after}`;
      }

      function normalizeFinalGradeTable(text) {
        const header = "최종 점수 최종 성적";
        const headerIndex = text.indexOf(header);
        if (headerIndex < 0) return text;

        const tail = text.slice(headerIndex + header.length);
        const rows = [["테스트 케이스", "최종 점수", "최종 성적"]];
        const pattern =
          /TC(\d+)\s+(\d+)\s+(.+?)(?=\s+TC\d+\s+\d+|\s+테스트 케이스로|\s+다음 중|$)/g;
        let match;
        let consumed = 0;
        while ((match = pattern.exec(tail))) {
          rows.push([`TC${match[1]}`, match[2], match[3].trim()]);
          consumed = pattern.lastIndex;
        }
        if (rows.length < 3) return text;

        const before = text.slice(0, headerIndex);
        const after = tail.slice(consumed).trim();
        return `${before.trim()}\n__IMAGE__:source-visuals/A21-final-grade.png\n${after}`;
      }

      function normalizeProjectEffortTable(text) {
        const pattern =
          /프로젝트 개발 노력\(\$\) 테스트 노력\(\$\)\s+P1\s+([\d,]+)\s+([\d,]+)\s+P2\s+([\d,]+)\s+([\d,]+)\s+P3\s+([\d,]+)\s+([\d,]+)\s+P4\s+([\d,]+)\s+([\d,]+)/;
        const match = text.match(pattern);
        if (!match) return text;
        const rows = [
          ["프로젝트", "개발 노력($)", "테스트 노력($)"],
          ["P1", match[1], match[2]],
          ["P2", match[3], match[4]],
          ["P3", match[5], match[6]],
          ["P4", match[7], match[8]],
        ];
        return text.replace(match[0], "\n__IMAGE__:source-visuals/B31-project-effort.png\n");
      }

      function normalizeSortLogTable(text) {
        if (!/테스트 실행 로그/.test(text) || !/TC1\s+실행/.test(text))
          return text;
        const questionSplit = text.match(/([\s\S]*?)(다음 중[\s\S]*)$/);
        const mainText = questionSplit ? questionSplit[1] : text;
        const questionText = questionSplit ? questionSplit[2] : "";
        const introSplit = mainText.split(/환경 구성:/);
        if (introSplit.length < 2) return text;

        const rows = [["TC", "입력", "출력", "결과"]];
        const logText = `환경 구성:${introSplit.slice(1).join("환경 구성:")}`;
        const tcPattern =
          /TC(\d+)\s+실행\.\s+입력:\s*([\s\S]*?)\s+출력:\s*([\s\S]*?)\s+결과:\s*(통과|실패)/g;
        let match;
        while ((match = tcPattern.exec(logText))) {
          rows.push([
            `TC${match[1]}`,
            compactCell(match[2]),
            compactCell(match[3]),
            match[4],
          ]);
        }
        if (rows.length === 1) return text;
        const meta = logText
          .replace(/TC1\s+실행[\s\S]*/, "")
          .replace(/^환경 구성:\s*/, "")
          .replace(/\s*,\s*/g, "\n")
          .trim();
        return `${introSplit[0].trim()}\n__IMAGE__:source-visuals/B38-sort-log.png\n${questionText.trim()}`;
      }

      function compactCell(text) {
        return String(text || "")
          .replace(/\d{1,2}:\d{2}:\d{2}\.\d{3}/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }

      function render() {
        renderVisualControls();
        updateProductChrome();
        const set = currentSet();
        const questions = currentQuestions();
        if (currentDataError()) {
          lastRenderedQuestionKey = "";
          setMeta.textContent = productLabels[activeProduct];
          questionTitle.textContent = "데이터 로딩 오류";
          showAppStatus(
            "error",
            "문제 데이터를 불러오지 못했습니다.",
            "data/index.json 또는 세트별 문제 JSON을 로드하지 못했습니다. 정적 배포 경로와 파일 포함 여부를 확인하세요.",
            "다시 확인",
            () => window.location.reload(),
          );
          questionStem.replaceChildren();
          questionFigure.replaceChildren();
          questionFigure.hidden = true;
          options.replaceChildren();
          feedback.hidden = true;
          prevBtn.disabled = true;
          nextBtn.disabled = true;
          renderNav([]);
          renderStats();
          renderActionHint([]);
          return;
        }
        const canGrade =
          (state.mode === "exam" && !isExamGraded()) ||
          (state.mode === "random" && !isRandomGraded()) ||
          (state.mode === "review" && isReviewRetake());
        gradeActionSection.hidden = state.mode === "practice";
        gradeBtn.hidden = state.mode === "practice" || !canGrade;
        gradeBtn.disabled = !canGrade;
        gradeBtn.textContent =
          state.mode === "review" && isReviewRetake()
            ? "오답 재채점"
            : "채점하기";
        retryWrongBtn.hidden =
          state.mode !== "review" ||
          !isExamGraded() ||
          isReviewRetake() ||
          missedExamQuestions().length === 0;
        wrongNoteBtn.disabled = !hasWrongNoteItems();
        const navPosition =
          questions.length > 0
            ? ` · 현재 ${state.index + 1} / ${questions.length}`
            : "";
        toggleNavBtn.textContent = `${state.navCollapsed ? "문제 번호 펼치기" : "문제 번호 접기"}${navPosition}`;
        toggleNavBtn.setAttribute("aria-expanded", String(!state.navCollapsed));
        resetBtn.textContent = `${modeLabel()} 풀이 초기화`;
        questionNav.classList.toggle("collapsed", state.navCollapsed);
        navSummary.hidden = !state.navCollapsed;
        if (questions.length === 0) {
          lastRenderedQuestionKey = "";
          showAppStatus(
            "empty",
            state.mode === "review" ? "아직 오답이 없습니다." : "표시할 문제가 없습니다.",
            isExamGraded()
              ? "채점한 시험에서 틀린 문제가 없습니다. 다른 모드로 계속 풀 수 있습니다."
              : "시험 모드에서 채점하면 틀린 문제만 오답 모드에 표시됩니다.",
            "연습 모드로 이동",
            () => {
              state.mode = "practice";
              state.index = 0;
              renderMode();
              render();
            },
          );
          setMeta.textContent =
            state.mode === "random"
              ? `전체 랜덤 ${randomQuestions().length}문항`
              : `${set.title} · ${set.questions.length}문항`;
          questionTitle.textContent = "오답 없음";
          questionStem.textContent = isExamGraded()
            ? "채점한 시험에서 틀린 문제가 없습니다."
            : "시험 모드에서 채점하면 오답만 표시됩니다.";
          questionFigure.replaceChildren();
          questionFigure.hidden = true;
          options.replaceChildren();
          feedback.hidden = true;
          navSummary.textContent = "표시할 문제가 없습니다.";
          renderNav(questions);
          renderStats();
          renderActionHint(questions);
          saveUiState();
          return;
        }
        if (state.index >= questions.length) state.index = questions.length - 1;
        if (state.index < 0) state.index = 0;
        prevBtn.disabled = state.index === 0;
        nextBtn.disabled = state.index >= questions.length - 1;
        saveUiState();
        const question = questions[state.index];
        const questionKey = `${state.mode}:${question.setId || state.setId}:${question.number}:${state.index}`;
        const shouldResetQuestionScroll =
          questionKey !== lastRenderedQuestionKey;
        lastRenderedQuestionKey = questionKey;
        const selected = selectedFor(question);
        const multi = question.answer.length > 1;

        setMeta.textContent =
          state.mode === "random"
            ? `${question.setTitle} · 랜덤 ${state.index + 1} / ${questions.length}`
            : `${set.title} · ${set.questions.length}문항`;
        questionTitle.textContent = `문제 ${state.index + 1} / ${questions.length}${multi ? " · 복수정답" : ""}`;
        hideAppStatus();
        renderRichText(questionStem, question.stem, { plainContent: true });
        renderFigure(question);
        navSummary.textContent = `현재 ${state.index + 1} / ${questions.length}`;
        document.querySelector(".stem-toggle-btn")?.remove();
        questionStem.classList.remove("stem-collapsed");

        options.replaceChildren();
        if (multi) {
          const badge = document.createElement("div");
          badge.className = "multi-answer-badge";
          badge.innerHTML = `<span class="badge-icon">⚠️</span> ${question.answer.length}개 선택 문제 — 정답을 <strong>${question.answer.length}개</strong> 모두 고르세요.`;
          options.appendChild(badge);
        }

        if (question.type === "short_answer" || question.options.length === 0) {
          renderShortAnswerControl(question, selected[0] || "");
        }

        question.options.forEach((option) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "option";
          button.disabled = isAnswerLocked();
          const isSelected = selected.includes(option.key);
          button.setAttribute("aria-pressed", String(isSelected));
          button.setAttribute(
            "aria-label",
            `선택지 ${option.key}${isSelected ? ", 선택됨" : ""}`,
          );
          button.classList.toggle("selected", isSelected);
          if (shouldShowResults()) {
            button.classList.toggle(
              "correct",
              question.answer.includes(option.key),
            );
            button.classList.toggle(
              "wrong",
              isSelected && !question.answer.includes(option.key),
            );
          }
          const key = document.createElement("span");
          key.className = "option-key";
          key.textContent = option.key;
          const text = document.createElement("span");
          text.className = "option-text";
          renderRichText(text, option.text);
          button.draggable = false;
          button.append(key, text);
          button.addEventListener("click", () =>
            chooseOption(question, option.key),
          );
          options.appendChild(button);
        });

        feedback.hidden = !shouldShowFeedback(selected);
        if (!feedback.hidden) {
          const result = isCorrect(question) ? "정답" : "오답";
          feedback.replaceChildren();
          feedback.classList.toggle("collapsed", !feedbackExpanded);
          const title = document.createElement("strong");
          title.textContent = `${result} · 정답 ${formatChoice(question.answer)}`;
          const explanation = document.createElement("span");
          explanation.className = "feedback-body";
          renderRichText(explanation, question.explanation);
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "feedback-toggle";
          toggle.textContent = feedbackExpanded ? "해설 접기" : "해설 펼치기";
          toggle.addEventListener("click", () => {
            feedbackExpanded = !feedbackExpanded;
            render();
          });
          feedback.append(title, explanation, toggle);
        } else {
          feedback.classList.remove("collapsed");
        }

        renderNav(questions);
        renderStats();
        renderActionHint(questions);
        if (shouldResetQuestionScroll) {
          scrollQuestionIntoView("auto");
        }
      }

      function renderNav(questions) {
        questionNav.replaceChildren();
        const fragment = document.createDocumentFragment();
        questions.forEach((question, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent =
            state.mode === "random" ? index + 1 : question.number;
          button.setAttribute(
            "aria-label",
            `문제 ${index + 1}${index === state.index ? ", 현재 문제" : ""}`,
          );
          if (index === state.index) button.setAttribute("aria-current", "true");
          button.classList.toggle("current", index === state.index);
          button.classList.toggle("answered", selectedFor(question).length > 0);
          button.classList.toggle(
            "correct",
            shouldShowResults() && isCorrect(question),
          );
          button.classList.toggle(
            "missed",
            shouldShowResults() && !isCorrect(question),
          );
          button.classList.toggle(
            "unanswered",
            selectedFor(question).length === 0,
          );
          button.addEventListener("click", () => {
            feedbackExpanded = false;
            state.index = index;
            render();
          });
          fragment.appendChild(button);
        });
        questionNav.appendChild(fragment);
        setTimeout(() => {
          const currentBtn = questionNav.querySelector(".current");
          if (currentBtn) {
            currentBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
          }
        }, 10);
      }

      function renderStats() {
        const questions =
          state.mode === "review" || state.mode === "random"
            ? currentQuestions()
            : currentSet().questions;
        const answered = questions.filter(
          (question) => selectedFor(question).length,
        ).length;
        progressText.textContent = `${answered} / ${questions.length}`;
        const ratio =
          questions.length === 0
            ? 0
            : Math.round((answered / questions.length) * 100);
        progressFill.style.width = `${ratio}%`;
        renderSidebarSummary();
      }

      function renderActionHint(questions = currentQuestions()) {
        const activeQuestions =
          questions.length > 0 ? questions : currentQuestions();
        let message = "";
        if (state.mode === "exam" && !isExamGraded()) {
          const remaining = unansweredCount("exam");
          message =
            remaining > 0
              ? `미응답 ${remaining}문항이 남아 있습니다.`
              : "모든 문항에 답했습니다. 채점할 수 있습니다.";
        } else if (state.mode === "random" && !isRandomGraded()) {
          const remaining = unansweredCount("random");
          message =
            remaining > 0
              ? `미응답 ${remaining}문항이 남아 있습니다.`
              : "랜덤 세트 채점 준비가 끝났습니다.";
        } else if (state.mode === "review" && !isExamGraded()) {
          message = "시험 모드에서 채점하면 오답 풀이가 열립니다.";
        } else if (state.mode === "review" && isReviewRetake()) {
          const remaining = activeQuestions.filter(
            (question) => selectedFor(question, "exam").length === 0,
          ).length;
          message =
            remaining > 0
              ? `오답 다시풀기 미응답 ${remaining}문항이 남아 있습니다.`
              : "오답 재채점 준비가 끝났습니다.";
        } else if (!hasWrongNoteItems()) {
          message = "오답 노트는 채점 후 확인할 수 있습니다.";
        }
        actionHint.textContent = message;
      }

      function historyWrongNoteItems(history) {
        const items = [];
        let questions = [];
        let setTitle = "";
        
        if (history.mode === "random") {
          questions = (history.randomRefs || []).map(ref => {
            const set = data.sets.find(s => s.id === ref.setId);
            if (!set) return null;
            const q = set.questions.find(item => item.number === ref.number);
            return q ? { ...q, setId: set.id, setTitle: set.title } : null;
          }).filter(Boolean);
          setTitle = "랜덤";
        } else {
          const set = data.sets.find(s => s.id === history.setId);
          if (set) {
             questions = set.questions;
             setTitle = set.title;
          }
        }
        
        questions.forEach((question) => {
           const ansKey = answerKey(question, history.mode);
           const selected = history.answers[ansKey] || [];
           const isCor =
             question.type === "short_answer"
               ? normalizeTextAnswer(selected[0]) === normalizeTextAnswer(question.answer[0])
               : sameChoices(selected, question.answer);
           
           if (!isCor) {
             items.push({
               ...question,
               setId: question.setId || history.setId,
               setTitle: question.setTitle || setTitle,
               noteMode: history.mode,
               historySelected: selected,
               historyId: history.id
             });
           }
        });
        return items;
      }

      function hasWrongNoteItems() {
        return state.histories.some(history => historyWrongNoteItems(history).length > 0);
      }

      function openWrongNote() {
        if (!hasWrongNoteItems()) return;
        
        let validHistory = state.histories.find(h => h.id === wrongNoteFilter);
        if (!validHistory || historyWrongNoteItems(validHistory).length === 0) {
           const historiesWithErrors = [...state.histories].reverse().filter(h => historyWrongNoteItems(h).length > 0);
           if (historiesWithErrors.length > 0) {
             wrongNoteFilter = historiesWithErrors[0].id;
           }
        }
        renderWrongNote();
        openModal(wrongNoteModal, wrongNoteCloseBtn);
      }

      function renderWrongNote() {
        wrongNoteBody.replaceChildren();

        if (state.histories.length === 0) {
          const empty = document.createElement("p");
          empty.className = "wrong-note-text";
          empty.textContent = "채점 기록이 없습니다.";
          wrongNoteBody.appendChild(empty);
          return;
        }

        const filterRow = document.createElement("div");
        filterRow.className = "wrong-note-filters";

        const createFilterBtn = (value, text) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = text;
          btn.style.whiteSpace = "nowrap";
          btn.style.padding = "8px 16px";
          btn.style.borderRadius = "20px";
          btn.style.minHeight = "36px";
          if (wrongNoteFilter === value) {
            btn.className = "primary";
          } else {
            btn.className = "subtle";
            btn.style.border = "1px solid var(--line)";
          }
          btn.addEventListener("click", () => {
            wrongNoteFilter = value;
            renderWrongNote();
          });
          return btn;
        };

        const historiesWithErrors = [...state.histories].reverse().filter(h => historyWrongNoteItems(h).length > 0);

        historiesWithErrors.forEach((history, index) => {
          const d = new Date(history.timestamp);
          const timeStr = `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
          const setTitle = history.mode === "random" ? "랜덤" : (data.sets.find(s => s.id === history.setId)?.title || history.setId);
          const count = historyWrongNoteItems(history).length;
          filterRow.appendChild(createFilterBtn(history.id, `기록 ${historiesWithErrors.length - index}: ${setTitle} (${timeStr})`));
        });

        wrongNoteBody.appendChild(filterRow);

        const currentHistory = state.histories.find(h => h.id === wrongNoteFilter);
        const items = currentHistory ? historyWrongNoteItems(currentHistory) : [];

        if (items.length === 0) {
          const empty = document.createElement("p");
          empty.className = "wrong-note-text";
          empty.textContent = "선택한 기록에 오답이 없습니다.";
          wrongNoteBody.appendChild(empty);
        } else {
          const list = document.createElement("div");
          list.className = "wrong-note-list";
          items.forEach((question) => {
            const noteMode = question.noteMode || "exam";
            const item = document.createElement("article");
            item.className = "wrong-note-item";
            const meta = document.createElement("span");
            meta.className = "wrong-note-meta";
            const source = question.setTitle ? `${question.setTitle} · ` : "";
            meta.textContent = `${source}문제 ${question.number} · 내 답 ${formatChoice(question.historySelected) || "-"} · 정답 ${formatChoice(question.answer)}`;
            const text = document.createElement("p");
            text.className = "wrong-note-text";
            text.textContent = stripPdfNoise(plainQuestionText(question.stem)).split("\n")[0];
            const go = document.createElement("button");
            go.type = "button";
            go.textContent = "문제 보기";
            go.addEventListener("click", () => {
              if (noteMode === "random") {
                state.mode = "random";
                setReviewRetake(false);
                if (currentHistory && currentHistory.randomRefs) {
                  state.randomRefs = currentHistory.randomRefs;
                }
                renderMode();
              } else if (question.setId && question.setId !== state.setId) {
                state.setId = question.setId;
                state.mode = "review";
                setReviewRetake(false);
                renderExamSelect();
                renderMode();
              } else {
                state.mode = "review";
                setReviewRetake(false);
                renderMode();
              }
              const questions = currentQuestions();
              const index = questions.findIndex(
                (item) =>
                  (item.setId || state.setId) ===
                    (question.setId || state.setId) &&
                  item.number === question.number,
              );
              if (index >= 0) state.index = index;
              closeWrongNote();
              render();
            });
            item.append(meta, text, go);
            list.appendChild(item);
          });
          wrongNoteBody.appendChild(list);
        }
      }

      function closeWrongNote() {
        closeModal(wrongNoteModal, () => {
          wrongNoteBody.replaceChildren();
        });
      }

      function shouldShowResults() {
        return (
          (state.mode === "review" && !isReviewRetake()) ||
          (state.mode === "exam" && isExamGraded()) ||
          (state.mode === "random" && isRandomGraded())
        );
      }

      function shouldShowFeedback(selected) {
        return (
          (state.mode === "review" && !isReviewRetake()) ||
          (state.mode === "exam" && isExamGraded()) ||
          (state.mode === "random" && isRandomGraded()) ||
          (state.mode === "practice" && selected.length > 0)
        );
      }

      function isAnswerLocked() {
        return (
          (state.mode === "review" && !isReviewRetake()) ||
          (state.mode === "exam" && isExamGraded()) ||
          (state.mode === "random" && isRandomGraded())
        );
      }

      function renderShortAnswerControl(question, value) {
        const wrapper = document.createElement("label");
        wrapper.className = "short-answer";
        const label = document.createElement("span");
        label.textContent = "답안 입력";
        const input = document.createElement("input");
        input.type = "text";
        input.value = value;
        input.disabled = isAnswerLocked();
        input.placeholder = "정답을 입력하세요";
        input.autocomplete = "off";
        input.addEventListener("input", () => {
          const nextValue = input.value.trim();
          if (nextValue) {
            state.answers[answerKey(question)] = [nextValue];
          } else {
            delete state.answers[answerKey(question)];
          }
          saveAnswers();
          saveUiState();
          renderNav(currentQuestions());
          renderStats();
          renderActionHint(currentQuestions());
        });
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            render();
          }
        });
        wrapper.append(label, input);
        options.appendChild(wrapper);
      }

      function chooseOption(question, key) {
        if (isAnswerLocked()) return;
        feedbackExpanded = false;
        const current = new Set(selectedFor(question));
        if (question.answer.length > 1) {
          if (!current.has(key) && current.size >= question.answer.length) {
            window.alert(`정답을 ${question.answer.length}개까지만 선택할 수 있습니다.`);
            return;
          }
          current.has(key) ? current.delete(key) : current.add(key);
        } else {
          current.clear();
          current.add(key);
        }
        state.answers[answerKey(question)] = [...current];
        saveAnswers();
        saveUiState();
        render();
      }

      function move(delta) {
        const questions = currentQuestions();
        if (!questions.length) return;
        const nextIndex = Math.max(
          0,
          Math.min(state.index + delta, questions.length - 1),
        );
        if (nextIndex === state.index) return;
        feedbackExpanded = false;
        state.index = nextIndex;
        saveUiState();
        render();
      }

      function scrollQuestionIntoView(behavior = "auto") {
        requestAnimationFrame(() => {
          workspace?.scrollTo({ top: 0, behavior });
        });
      }

      function resetCurrentSet(skipConfirm = false) {
        if (
          !skipConfirm &&
          !window.confirm(
            `${modeLabel()} 모드의 현재 풀이와 채점 상태를 초기화할까요?`,
          )
        )
          return;
        resetAnswersFor(answerMode());
        if (state.mode === "random") {
          generateRandomRefs();
          setRandomGraded(false);
        }
        if (state.mode === "exam" || state.mode === "review")
          setExamGraded(false);
        if (state.mode === "review") {
          setReviewRetake(false);
          state.reviewIds[state.setId] = [];
        }
        state.elapsedSeconds = 0;
        state.lastTick = Date.now();
        saveAnswers();
        saveUiState();
        render();
      }

      function hasModeProgress(mode = state.mode) {
        const questions =
          mode === "random"
            ? randomQuestions()
            : mode === "review"
              ? currentQuestions()
              : currentSet().questions;
        const answerModeForCheck = mode === "review" ? "exam" : mode;
        return questions.some(
          (question) => selectedFor(question, answerModeForCheck).length > 0,
        );
      }

      function resetModeStart(mode) {
        if (mode === "exam") {
          resetAnswersFor("exam");
          setExamGraded(false);
          setReviewRetake(false);
          state.reviewIds[state.setId] = [];
        }
        if (mode === "practice") {
          resetAnswersFor("practice");
        }
        if (mode === "random") {
          resetAnswersFor("random");
          generateRandomRefs();
          setRandomGraded(false);
        }
        state.elapsedSeconds = 0; state.lastTick = Date.now();
      }

      function updateTimer() {
        if (isExamGraded() || isRandomGraded() || state.mode === 'review') return;
        const now = Date.now();
        if (state.lastTick) {
          state.elapsedSeconds = (state.elapsedSeconds || 0) + (now - state.lastTick) / 1000;
        }
        state.lastTick = now;
        const seconds = Math.floor(state.elapsedSeconds || 0);
        const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
        const remainder = String(seconds % 60).padStart(2, "0");
        timerText.textContent = `${minutes}:${remainder}`;
        mobileTimerBadge.textContent = `시간 ${minutes}:${remainder}`;
      }

      examSelect.addEventListener("change", () => {
        const nextSetId = examSelect.value;
        if (nextSetId === state.setId) return;
        if (
          hasModeProgress() &&
          !window.confirm(
            "문제 풀이가 진행 중입니다. 문제 세트를 변경하면 현재 모드의 진행 상태가 초기화됩니다. 변경할까요?",
          )
        ) {
          examSelect.value = state.setId;
          return;
        }
        resetModeStart(state.mode);
        state.setId = examSelect.value;
        state.index = 0;
        state.elapsedSeconds = 0; state.lastTick = Date.now();
        saveUiState();
        render();
      });

      document.querySelectorAll("[data-mode]").forEach((button) => {
        button.addEventListener("click", () => {
          const nextMode = button.dataset.mode;
          if (nextMode === state.mode) return;
          if (
            hasModeProgress() &&
            !window.confirm(
              "문제 풀이가 진행 중입니다. 모드를 변경하면 현재 모드의 진행 상태가 초기화됩니다. 변경할까요?",
            )
          )
            return;
          resetModeStart(nextMode);
          state.mode = nextMode;
          state.index = 0;
          saveAnswers();
          saveUiState();
          renderMode();
          render();
        });
      });

      document.querySelectorAll("[data-font-size]").forEach((button) => {
        button.addEventListener("click", () => {
          state.fontSize = validFontSize(button.dataset.fontSize);
          saveUiState();
          renderVisualControls();
        });
      });

      gradeBtn.addEventListener("click", () => {
        let gradedNow = false;
        if (state.mode === "exam") {
          const remaining = unansweredCount("exam");
          if (
            remaining > 0 &&
            !window.confirm(
              `아직 ${remaining}문제를 풀지 않았습니다. 그래도 채점할까요?`,
            )
          )
            return;
          setExamGraded(true);
          setReviewRetake(false);
          state.reviewIds[state.setId] = missedExamQuestions().map(
            (question) => question.number,
          );
          gradedNow = true;
        }
        if (state.mode === "random") {
          const remaining = unansweredCount("random");
          if (
            remaining > 0 &&
            !window.confirm(
              `아직 ${remaining}문제를 풀지 않았습니다. 그래도 채점할까요?`,
            )
          )
            return;
          setRandomGraded(true);
          gradedNow = true;
        }
        if (state.mode === "review" && isReviewRetake()) {
          const remaining = currentQuestions().filter(
            (question) => selectedFor(question, "exam").length === 0,
          ).length;
          if (
            remaining > 0 &&
            !window.confirm(
              `오답 재풀이 중 ${remaining}문제가 비어 있습니다. 그래도 재채점할까요?`,
            )
          )
            return;
          setReviewRetake(false);
          state.reviewIds[state.setId] = missedExamQuestions().map(
            (question) => question.number,
          );
          gradedNow = true;
        }
        
        if (gradedNow) {
          const timestamp = Date.now();
          const targetMode = state.mode === "random" ? "random" : "exam";
          const targetSetId = state.mode === "random" ? "random" : state.setId;
          
          const historyAnswers = {};
          Object.keys(state.answers).forEach(key => {
            if (key.endsWith(`-${targetMode}`) || key.includes(`-${targetMode}-`)) {
               historyAnswers[key] = state.answers[key];
            }
          });

          state.histories.push({
            id: timestamp.toString(),
            timestamp,
            mode: targetMode,
            setId: targetSetId,
            answers: historyAnswers,
            randomRefs: state.mode === "random" ? [...state.randomRefs] : null
          });
        }

        saveUiState();
        render();
        if (gradedNow) {
          window.alert("채점이 완료되었습니다.");
        }
      });

      retryWrongBtn.addEventListener("click", () => {
        const missed = missedExamQuestions();
        if (missed.length === 0) return;
        state.reviewIds[state.setId] = missed.map(
          (question) => question.number,
        );
        missed.forEach(
          (question) => delete state.answers[answerKey(question, "exam")],
        );
        setReviewRetake(true);
        state.index = 0;
        state.elapsedSeconds = 0; state.lastTick = Date.now();
        saveAnswers();
        saveUiState();
        render();
      });

      exportBackupBtn.addEventListener("click", exportBackup);
      const settingsBackdrop = document.createElement("div");
      settingsBackdrop.className = "settings-backdrop";
      document.body.appendChild(settingsBackdrop);
      settingsBackdrop.addEventListener("click", () => {
        if (settingsPanelToggleBtn.getAttribute("aria-expanded") === "true") {
          settingsPanelToggleBtn.click();
        }
      });
      const settingsObserver = new MutationObserver(() => {
        const isOpen = !settingsPanel.hidden;
        settingsBackdrop.classList.toggle("active", isOpen);
      });
      settingsObserver.observe(settingsPanel, { attributes: true, attributeFilter: ["hidden"] });

      consoleLogBtn.addEventListener("click", () => {
        if (window.VConsole) return;
        
        consoleLogBtn.textContent = "vConsole 로딩 중...";
        consoleLogBtn.disabled = true;
        
        const script = document.createElement("script");
        script.src = "https://unpkg.com/vconsole@latest/dist/vconsole.min.js";
        script.onload = () => {
          window.vConsole = new window.VConsole();
          consoleLogBtn.textContent = "vConsole 활성화됨";
          
          if (settingsPanelToggleBtn.getAttribute("aria-expanded") === "true") {
            settingsPanelToggleBtn.click();
          }
        };
        script.onerror = () => {
          consoleLogBtn.textContent = "로딩 실패";
          consoleLogBtn.disabled = false;
        };
        document.body.appendChild(script);
      });
      copyConsoleLogBtn.addEventListener("click", copyConsoleLog);
      exportConsoleLogBtn.addEventListener("click", exportConsoleLog);
      clearConsoleLogBtn.addEventListener("click", clearConsoleLog);

      importBackupBtn.addEventListener("click", () => {
        backupFileInput.click();
      });

      backupFileInput.addEventListener("change", () => {
        const [file] = backupFileInput.files || [];
        importBackup(file).finally(() => {
          backupFileInput.value = "";
        });
      });

      toggleNavBtn.addEventListener("click", () => {
        state.navCollapsed = !state.navCollapsed;
        saveUiState();
        render();
      });

      resetAllBtn.addEventListener("click", () => {
        if (
          !window.confirm(
            "현재 문제 세트의 연습, 시험, 오답 기록을 모두 삭제할까요?",
          )
        )
          return;
        resetAnswersFor("practice");
        resetAnswersFor("exam");
        resetAnswersFor("random");
        setExamGraded(false);
        setRandomGraded(false);
        generateRandomRefs();
        setReviewRetake(false);
        state.reviewIds[state.setId] = [];
        state.index = 0;
        state.elapsedSeconds = 0; state.lastTick = Date.now();
        saveAnswers();
        saveUiState();
        render();
      });

      resetBtn.addEventListener("click", resetCurrentSet);
      prevBtn.addEventListener("click", () => move(-1));
      nextBtn.addEventListener("click", () => move(1));
      wrongNoteBtn.addEventListener("click", openWrongNote);

      const sidebarBackdrop = document.querySelector("#sidebarBackdrop");

      openIstqbBtn?.addEventListener("click", openIstqbApp);
      openCstsBtn?.addEventListener("click", openCstsApp);
      productHomeBtn?.addEventListener("click", showProductGate);
      topbarHomeBtn?.addEventListener("click", showProductGate);

      function isMobileLayout() {
        return window.innerWidth <= 900;
      }

      function updateSidebarBackdrop() {
        if (!sidebarBackdrop) return;
        const showBackdrop = isMobileLayout() && !state.sidebarCollapsed;
        sidebarBackdrop.classList.toggle("visible", showBackdrop);
        document.body.style.overflow = showBackdrop ? "hidden" : "";
      }

      sidebarBackdrop.addEventListener("click", () => {
        state.sidebarCollapsed = true;
        saveUiState();
        renderSidebarSummary();
        updateSidebarBackdrop();
      });

      sidebarToggleBtn.addEventListener("click", () => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
        saveUiState();
        renderSidebarSummary();
        updateSidebarBackdrop();
      });
      settingsPanelToggleBtn.addEventListener("click", () => {
        const isOpen = settingsPanelToggleBtn.getAttribute("aria-expanded") === "true";
        settingsPanelToggleBtn.setAttribute("aria-expanded", String(!isOpen));
        settingsPanel.hidden = isOpen;
      });
      figureModalCloseBtn.addEventListener("click", closeFigureModal);
      figureModal.addEventListener("click", (event) => {
        if (event.target === figureModal) closeFigureModal();
      });
      wrongNoteCloseBtn.addEventListener("click", closeWrongNote);
      if (clearWrongNoteBtn) {
        clearWrongNoteBtn.addEventListener("click", () => {
          if (confirm("정말로 모든 오답 기록을 비우시겠습니까?")) {
            state.histories = [];
            savePersistentSnapshot();
            renderWrongNote();
          }
        });
      }
      wrongNoteModal.addEventListener("click", (event) => {
        if (event.target === wrongNoteModal) closeWrongNote();
      });
      backupImportCloseBtn.addEventListener("click", closeBackupImport);
      backupImportModal.addEventListener("click", (event) => {
        if (event.target === backupImportModal) closeBackupImport();
      });
      consoleLogCloseBtn.addEventListener("click", closeConsoleLog);
      consoleLogModal.addEventListener("click", (event) => {
        if (event.target === consoleLogModal) closeConsoleLog();
      });

      document.addEventListener("keydown", (event) => {
        const modal = activeModal();
        if (event.key === "Tab" && modal) {
          const focusable = getFocusableElements(modal);
          if (focusable.length === 0) {
            event.preventDefault();
            return;
          }
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
            return;
          }
          if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
            return;
          }
        }
        if (event.key === "Escape") {
          closeFigureModal();
          closeWrongNote();
          closeBackupImport();
          closeConsoleLog();
          return;
        }
        if (modal) return;
        if (event.key === "ArrowLeft") move(-1);
        if (event.key === "ArrowRight") move(1);
      });

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          backgroundedAt = Date.now();
          saveAnswers();
          saveUiState();
          return;
        }
        if (
          document.visibilityState === "visible" &&
          backgroundedAt &&
          Date.now() - backgroundedAt >= 10000 &&
          hasModeProgress()
        ) {
          const shouldReset = window.confirm(
            "앱을 잠시 벗어났습니다. 진행 중인 모드를 초기화할까요?\n\n확인: 초기화\n취소: 이어하기",
          );
          backgroundedAt = 0;
          if (shouldReset) {
            resetCurrentSet(true);
            return;
          }
          render();
        }
      });

      window.addEventListener("pagehide", () => {
        saveAnswers();
        saveUiState();
      });

      if (lastProduct) {
        showActiveProductApp();
      }

      renderExamSelect();
      renderMode();
      render();
      restorePersistentSnapshot();
      updateTimer();
      setInterval(updateTimer, 1000);

      if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
          navigator.serviceWorker
            .register("./service-worker.js")
            .catch((error) => {
              appLogStore.add("warn", [
                "Service worker registration failed. The app can still run online.",
                error,
              ]);
              console.warn("Service worker registration failed:", error);
            });
        });
      }
      })();
