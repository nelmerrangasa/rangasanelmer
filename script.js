/* =====================================================
   READSTART - DIGITAL BEGINNING READING MATERIALS
   PUBLIC VERSION (no login)

   NEW IN THIS VERSION
   - Assessment opens first; pre-test must be taken first
   - Pre-test / post-test: 20 items, answered by SPEAKING
     (microphone + speech recognition)
   - Alphabet: phonics chant  (A /æ/ /æ/ /æ/ Apple)
   - Stories: written as sentences, 10 stories,
     sentence-by-sentence read aloud with highlight
   - "Listen to Instructions" button in every section
===================================================== */


/* =====================================================
   SETTINGS
===================================================== */

// true  = other pages stay locked until the pre-test is done
// false = students may open any page at any time
const REQUIRE_PRETEST_FIRST = true;

const PASSING_CHAMPION_SCORE = 16;   // out of 20


/* =====================================================
   FIREBASE
===================================================== */

import { initializeApp }
    from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";

import { getFirestore, collection, addDoc, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

let db = null;

try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log("ReadStart Firestore connected.");
} catch (error) {
    console.warn("Firestore is not configured yet.", error);
}

async function saveToFirestore(type, data) {
    if (!db) return;
    try {
        await addDoc(collection(db, "readstart_records"), {
            type: type,
            data: data,
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Firestore error:", error);
    }
}


/* =====================================================
   STUDENT DATA
===================================================== */

let studentData = JSON.parse(localStorage.getItem("readStartStudent")) || {};

studentData = Object.assign({
    stars: 0,
    activities: 0,
    booksRead: 0,
    badges: [],
    preTest: null,
    postTest: null,
    preDetails: null,
    postDetails: null
}, studentData);

function saveStudentData() {
    localStorage.setItem("readStartStudent", JSON.stringify(studentData));
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}


/* =====================================================
   TEXT TO SPEECH  (with queue support)
===================================================== */

let speakToken = 0;

function speechSupported() {
    return "speechSynthesis" in window;
}

/*
   items: array of strings or {text, rate, pause}
   onItem(index) is called when an item starts; -1 when all done.
*/
function speakQueue(items, onItem) {

    if (!speechSupported()) {
        alert("Speech is not supported by this browser.");
        return;
    }

    window.speechSynthesis.cancel();

    const token = ++speakToken;
    let i = 0;

    const next = () => {

        if (token !== speakToken) return;

        if (i >= items.length) {
            if (onItem) onItem(-1);
            return;
        }

        const index = i++;
        const item = items[index];
        const text = typeof item === "string" ? item : item.text;
        const rate = (typeof item === "object" && item.rate) || 0.75;
        const pause = (typeof item === "object" && item.pause !== undefined)
            ? item.pause : 250;

        if (onItem) onItem(index);

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = rate;
        utterance.pitch = 1.05;
        utterance.onend = () => setTimeout(next, pause);
        utterance.onerror = () => setTimeout(next, pause);

        window.speechSynthesis.speak(utterance);
    };

    next();
}

function speak(text) {
    speakQueue([text]);
}

function stopSpeaking() {
    speakToken++;
    if (speechSupported()) window.speechSynthesis.cancel();
}


/* =====================================================
   SPEECH RECOGNITION (microphone)
===================================================== */

const SpeechRecognitionAPI =
    window.SpeechRecognition || window.webkitSpeechRecognition || null;

let activeRecognition = null;

function stopListeningNow() {
    if (activeRecognition) {
        try { activeRecognition.abort(); } catch (e) {}
        activeRecognition = null;
    }
}

/*
   onResult(arrayOfTranscripts)
   onError(errorCode)   e.g. "no-speech", "not-allowed", "network"
*/
function listenOnce(onResult, onError) {

    stopListeningNow();

    const recognition = new SpeechRecognitionAPI();
    activeRecognition = recognition;

    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 5;
    recognition.continuous = false;

    let gotResult = false;

    recognition.onresult = (event) => {
        gotResult = true;
        const alternatives = Array.from(event.results[0])
            .map(a => a.transcript);
        onResult(alternatives);
    };

    recognition.onerror = (event) => {
        if (gotResult) return;
        gotResult = true;
        onError(event.error || "error");
    };

    recognition.onend = () => {
        if (activeRecognition === recognition) activeRecognition = null;
        if (!gotResult) {
            gotResult = true;
            onError("no-speech");
        }
    };

    try {
        recognition.start();
    } catch (e) {
        onError("error");
    }
}


/* =====================================================
   INSTRUCTIONS (spoken)
===================================================== */

const instructions = {

    dashboard:
        "Welcome to ReadStart. This is your home page. " +
        "Tap Alphabet to learn letters and sounds. " +
        "Tap C V C Words to practice short words. " +
        "Tap Stories to read. Tap Activities to play reading games. " +
        "Your stars and badges are shown on this page.",

    alphabet:
        "This is the alphabet page. " +
        "Tap a letter card. You will hear the letter name, " +
        "the letter sound three times, and then an example word. " +
        "Listen carefully and say it with me.",

    words:
        "This is the C V C words page. " +
        "A C V C word has a consonant, a vowel, and a consonant. " +
        "Tap Hear Word. You will hear each letter sound, and then the whole word. " +
        "Say it with me.",

    books:
        "This is the story page. " +
        "Choose a story and tap Read Story. " +
        "Tap Read Aloud to listen to the story, one sentence at a time. " +
        "Tap a highlighted word to learn its meaning.",

    story:
        "Read each sentence. " +
        "Tap Read Aloud to hear the page. " +
        "Tap a highlighted word to see its meaning in the dictionary. " +
        "Tap Next to go to the next page, or Previous to go back.",

    activities:
        "This is the activities page. " +
        "Choose a game. Each game has ten questions. " +
        "Read the question, then tap the correct answer. " +
        "You earn stars for correct answers.",

    dictionary:
        "This is the ReadStart Dictionary. " +
        "Type a word in the box, then tap Search. " +
        "Tap Listen to hear the word, its meaning, and an example sentence.",

    assessment:
        "This is the reading assessment. " +
        "Take the pre-test first, before using the learning materials. " +
        "There are twenty questions. " +
        "For each question, read the letter, word, phrase, or sentence on the screen out loud. " +
        "Tap the microphone button, then speak clearly. " +
        "You may try two times for each question. " +
        "Take the post-test after you finish the learning materials.",

    progress:
        "This is your progress page. " +
        "You can see your stars, your activities, and your badges. " +
        "You can also compare your pre-test and post-test scores."
};

window.speakInstruction = function (key) {
    if (instructions[key]) speak(instructions[key]);
};


/* =====================================================
   PAGE NAVIGATION
===================================================== */

window.showPage = function (pageId) {

    if (REQUIRE_PRETEST_FIRST &&
        studentData.preTest === null &&
        pageId !== "assessment") {

        alert("Please take the Pre-Test first. 📝");
        pageId = "assessment";
    }

    stopSpeaking();
    stopListeningNow();

    document.querySelectorAll(".page")
        .forEach(page => page.classList.remove("active"));

    const page = document.getElementById(pageId);
    if (page) page.classList.add("active");

    document.querySelectorAll(".nav-btn").forEach(button => {
        button.classList.remove("active");
        const onclick = button.getAttribute("onclick");
        if (onclick && onclick.includes(`'${pageId}'`)) {
            button.classList.add("active");
        }
    });

    if (pageId === "assessment") refreshAssessmentMenu();

    updateDashboard();
    updateProgress();

    window.scrollTo({ top: 0, behavior: "smooth" });
};


/* =====================================================
   ALPHABET  -  PHONICS CHANT

   [Letter, Word, Emoji, SoundSymbol, SpokenSound]

   SoundSymbol = what the student SEES  (/æ/)
   SpokenSound = how the browser voice SAYS it ("ah")
   (Browser voices cannot read phonetic symbols, so the
    spoken respelling can be edited if a voice sounds off.)
===================================================== */

const alphabet = [
    ["A", "Apple",    "🍎", "æ",  "ah"],
    ["B", "Ball",     "⚽", "b",  "buh"],
    ["C", "Cat",      "🐱", "k",  "kuh"],
    ["D", "Dog",      "🐶", "d",  "duh"],
    ["E", "Egg",      "🥚", "ɛ",  "eh"],
    ["F", "Fish",     "🐟", "f",  "fff"],
    ["G", "Goat",     "🐐", "g",  "guh"],
    ["H", "Hat",      "🎩", "h",  "huh"],
    ["I", "Igloo",    "🏠", "ɪ",  "ih"],
    ["J", "Jam",      "🍓", "dʒ", "juh"],
    ["K", "Kite",     "🪁", "k",  "kuh"],
    ["L", "Lion",     "🦁", "l",  "lll"],
    ["M", "Moon",     "🌙", "m",  "mmm"],
    ["N", "Nest",     "🪺", "n",  "nnn"],
    ["O", "Orange",   "🍊", "ɒ",  "aw"],
    ["P", "Pig",      "🐷", "p",  "puh"],
    ["Q", "Queen",    "👑", "kw", "kwuh"],
    ["R", "Rain",     "🌧️", "r",  "rrr"],
    ["S", "Sun",      "☀️", "s",  "sss"],
    ["T", "Top",      "🔝", "t",  "tuh"],
    ["U", "Umbrella", "☂️", "ʌ",  "uh"],
    ["V", "Van",      "🚐", "v",  "vvv"],
    ["W", "Water",    "💧", "w",  "wuh"],
    ["X", "X-ray",    "🩻", "ks", "ks"],
    ["Y", "Yoyo",     "🪀", "j",  "yuh"],
    ["Z", "Zebra",    "🦓", "z",  "zzz"]
];

function loadAlphabet() {

    const grid = document.getElementById("alphabetGrid");
    if (!grid) return;

    grid.innerHTML = "";

    alphabet.forEach(item => {

        const [letter, word, emoji, symbol, say] = item;

        const card = document.createElement("div");
        card.className = "letter-card";

        card.innerHTML = `
            <div class="letter">${letter}</div>
            <div class="letter-sound">/${symbol}/ /${symbol}/ /${symbol}/</div>
            <div class="letter-picture">${emoji}</div>
            <div class="letter-word">${word}</div>
        `;

        card.onclick = () => {

            document.querySelectorAll(".letter-card.chanting")
                .forEach(c => c.classList.remove("chanting"));

            card.classList.add("chanting");

            // A. ah. ah. ah. Apple.
            speakQueue([
                { text: letter + ".", rate: 0.7, pause: 350 },
                { text: say, rate: 0.6, pause: 350 },
                { text: say, rate: 0.6, pause: 350 },
                { text: say, rate: 0.6, pause: 450 },
                { text: word, rate: 0.7, pause: 100 }
            ], (index) => {
                if (index === -1) card.classList.remove("chanting");
            });

            addProgress(1);
        };

        grid.appendChild(card);
    });
}


/* =====================================================
   CVC WORDS
===================================================== */

const words = [
    ["CAT", "🐱"], ["BAT", "🦇"], ["MAT", "🛏️"], ["HAT", "🎩"],
    ["SUN", "☀️"], ["CUP", "🥤"], ["DOG", "🐶"], ["PIG", "🐷"],
    ["BED", "🛏️"], ["BUS", "🚌"], ["MAP", "🗺️"], ["FAN", "🪭"],
    ["PEN", "🖊️"], ["FOX", "🦊"], ["HEN", "🐔"], ["RAT", "🐀"],
    ["CAP", "🧢"], ["LEG", "🦵"], ["MOP", "🧹"], ["TOP", "🔝"],
    ["RED", "🔴"], ["BIG", "🐘"], ["BOX", "📦"], ["HOT", "🔥"],
    ["MAN", "👨"], ["NAP", "😴"], ["RUN", "🏃"], ["SIT", "🪑"],
    ["HOP", "🐰"], ["LOG", "🪵"]
];

function loadWords() {

    const grid = document.getElementById("wordGrid");
    if (!grid) return;

    grid.innerHTML = "";

    words.forEach(word => {

        const card = document.createElement("div");
        card.className = "word-card";

        card.innerHTML = `
            <div class="word-picture">${word[1]}</div>
            <h2>${word[0]}</h2>
            <button class="primary-btn">🔊 Hear Word</button>
        `;

        card.querySelector("button").onclick = () => {

            // sound out each letter, then say the whole word
            const letters = word[0].split("").map(l => ({
                text: l, rate: 0.6, pause: 300
            }));

            speakQueue([
                ...letters,
                { text: word[0].toLowerCase(), rate: 0.7, pause: 100 }
            ]);
        };

        grid.appendChild(card);
    });
}


/* =====================================================
   READSTART DICTIONARY
===================================================== */

const E = (meaning, example) => ({ meaning, example });

const dictionary = {

    apple:  E("A round fruit that can be red, green, or yellow.", "I eat an apple for my snack."),
    ball:   E("A round object that people can throw, catch, or kick.", "The cat has a ball."),
    cat:    E("A small animal that is often kept as a pet.", "The cat sits on the mat."),
    dog:    E("An animal that people often keep as a pet.", "The dog runs in the yard."),
    fish:   E("An animal that lives and swims in water.", "The fish swims in the pond."),
    sun:    E("The bright star that gives Earth light and heat.", "The sun is bright today."),
    moon:   E("The bright object we can see in the night sky.", "The moon shines at night."),
    book:   E("A set of pages with words or pictures that people can read.", "We read a book."),
    happy:  E("Feeling good, joyful, or pleased.", "The child is happy."),
    run:    E("To move quickly using your legs.", "The dog can run."),
    red:    E("A color like the color of an apple or a rose.", "The ball is red."),
    big:    E("Large in size.", "The lion is big."),
    small:  E("Little in size.", "The puppy is small."),
    little: E("Small in size.", "This is a little dog."),
    friend: E("A person you like and enjoy spending time with.", "My friend helps me read."),
    school: E("A place where children learn.", "I go to school every day."),
    read:   E("To look at and understand written words.", "I like to read a story."),
    story:  E("A group of events told through words.", "The teacher reads a story."),
    hat:    E("Something worn on the head.", "I wear a hat in the sun."),
    cup:    E("A small container used for drinking.", "The cup has water."),
    pig:    E("A farm animal with a short nose and four legs.", "The pig is on the farm."),
    farm:   E("A place where people grow crops or keep animals.", "The pig is on the farm."),
    sam:    E("A name used for a person in the story.", "Sam sees the sun."),
    mia:    E("A name used for a girl in the story.", "Mia has a bag."),
    sees:   E("Looks at something with the eyes.", "Sam sees the sun."),
    has:    E("To have or own something.", "The cat has a ball."),
    can:    E("To be able to do something.", "The dog can run."),
    fun:    E("Something enjoyable or entertaining.", "Sam has fun."),
    hot:    E("Having a high temperature.", "The sun is hot."),
    we:     E("A word used when talking about yourself and another person or people.", "We read a book."),
    new:    E("Something that has not been known or used before.", "We learn new words."),
    words:  E("Groups of letters that have meaning.", "We learn new words."),
    learn:  E("To gain knowledge or a new skill.", "We learn new words."),
    animal: E("A living thing such as a dog, cat, pig, or fish.", "A dog is an animal."),
    lion:   E("A large wild animal with four legs and a mane.", "The lion is big."),
    zebra:  E("A wild animal with black and white stripes.", "The zebra has black and white stripes."),
    bat:    E("A small flying animal that is active mostly at night.", "The bat flies at night."),
    mat:    E("A piece of material placed on a floor.", "The cat sits on the mat."),
    bed:    E("A piece of furniture used for sleeping.", "I sleep in my bed."),
    bus:    E("A large vehicle that carries people.", "I ride the bus to school."),
    map:    E("A picture that shows where places are.", "I look at the map."),
    fan:    E("A machine that moves air to make a place cooler.", "The fan keeps the room cool."),
    pen:    E("A tool used for writing with ink.", "I write with a pen."),
    fox:    E("A small wild animal with a long tail.", "The fox runs in the forest."),
    hen:    E("A female chicken.", "The hen is on the farm."),
    rat:    E("A small animal with a long tail.", "The rat runs quickly."),
    cap:    E("A type of soft hat worn on the head.", "I wear a cap."),
    leg:    E("A body part used for standing and walking.", "I use my leg to walk."),
    mop:    E("A tool used for cleaning floors.", "I use a mop to clean the floor."),
    top:    E("The highest part of something.", "The bird sits on top."),
    box:    E("A container with a flat top and bottom.", "The toy is in the box."),
    man:    E("An adult male person.", "The man walks to school."),
    sit:    E("To rest your body on a chair or another surface.", "Please sit on the chair."),
    hop:    E("To make a small jump.", "The rabbit can hop."),
    log:    E("A piece of a tree trunk or branch.", "The log is on the ground."),

    /* ----- NEW WORDS (for the new stories) ----- */
    nap:      E("A short sleep during the day.", "The baby takes a nap."),
    mud:      E("Soft, wet dirt.", "The pig plays in the mud."),
    safe:     E("Not in danger.", "The hen is safe at home."),
    bag:      E("A container used to carry things.", "I put my books in my bag."),
    ride:     E("To sit in or on something that moves, like a bus.", "We ride the bus to school."),
    desk:     E("A table where a student sits to read and write.", "I read at my desk."),
    pond:     E("A small area of water.", "The fish swims in the pond."),
    swim:     E("To move through water using your body.", "Fish can swim."),
    rain:     E("Drops of water that fall from the clouds.", "The rain falls on the roof."),
    wet:      E("Covered with water.", "The dog is wet."),
    umbrella: E("Something you hold over your head to stay dry in the rain.", "I use an umbrella in the rain."),
    star:     E("A tiny bright light in the night sky.", "I can see a star."),
    stars:    E("Tiny bright lights in the night sky.", "The stars shine at night."),
    sky:      E("The space above us where we see the sun, moon, and clouds.", "The sky is blue."),
    bright:   E("Giving a lot of light.", "The sun is bright."),
    night:    E("The time when it is dark outside.", "I sleep at night.")
};

function capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}


/* =====================================================
   DICTIONARY SEARCH
===================================================== */

window.searchDictionary = function () {

    const input = document.getElementById("dictionarySearch");
    const results = document.getElementById("dictionaryResults");

    const search = input.value.trim().toLowerCase();

    results.innerHTML = "";

    if (!search) {
        results.innerHTML = `
            <div class="dictionary-card">
                <h2>📖 Search for a word</h2>
                <p>Type a word above to learn its meaning and example.</p>
            </div>`;
        return;
    }

    const matches = Object.keys(dictionary)
        .filter(word => word.includes(search));

    if (matches.length === 0) {
        results.innerHTML = `
            <div class="dictionary-card">
                <h2>Word Not Found</h2>
                <p>This word is not yet in the ReadStart Dictionary.</p>
            </div>`;
        return;
    }

    matches.forEach(word => {

        const entry = dictionary[word];
        const card = document.createElement("div");
        card.className = "dictionary-card";

        card.innerHTML = `
            <h2>${capitalize(word)}</h2>
            <p class="meaning"><strong>Meaning:</strong> ${entry.meaning}</p>
            <p class="example"><strong>Example:</strong> "${entry.example}"</p>
            <button class="primary-btn">🔊 Listen</button>
        `;

        card.querySelector("button").onclick = () => openDictionary(word);

        results.appendChild(card);
    });
};


/* =====================================================
   OPEN / CLOSE DICTIONARY MODAL
===================================================== */

function openDictionary(word) {

    const cleanWord = word.toLowerCase().replace(/[^a-zA-Z]/g, "");
    const entry = dictionary[cleanWord];

    if (!entry) return;

    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    set("modalDictionaryWord", capitalize(cleanWord));
    set("modalDictionaryWordText", capitalize(cleanWord));
    set("modalDictionaryMeaning", entry.meaning);
    set("modalDictionaryExample", entry.example);

    const modal = document.getElementById("dictionaryModal");
    if (modal) modal.classList.add("show");

    speakDictionary(cleanWord);
}

window.openDictionary = openDictionary;

window.closeDictionary = function () {
    const modal = document.getElementById("dictionaryModal");
    if (modal) modal.classList.remove("show");
    stopSpeaking();
};

function speakDictionary(word) {

    const entry = dictionary[word.toLowerCase()];
    if (!entry) return;

    speakQueue([
        { text: capitalize(word) + ".", pause: 400 },
        { text: "Meaning: " + entry.meaning, pause: 400 },
        { text: "Example: " + entry.example }
    ]);
}

window.speakDictionaryEntry = function () {
    const el = document.getElementById("modalDictionaryWord");
    if (!el) return;
    speakDictionary(el.textContent.toLowerCase());
};


/* =====================================================
   STORIES
   Each page is an ARRAY OF SENTENCES.
===================================================== */

const stories = [

    {
        id: "redcat", title: "The Red Cat", emoji: "🐱",
        pages: [
            ["This is a red cat.", "The cat has a big ball."],
            ["The cat can run and hop.", "The ball is on the mat."],
            ["The cat sees the sun.", "The sun is hot."],
            ["The cat sits on the mat.", "The red cat is happy."]
        ]
    },

    {
        id: "sam", title: "Sam and the Sun", emoji: "☀️",
        pages: [
            ["Sam sees the sun.", "The sun is big and hot."],
            ["Sam has a red cap.", "Sam puts on the cap."],
            ["Sam can run and hop.", "Sam has fun."],
            ["Sam sits on a log.", "Sam is happy."]
        ]
    },

    {
        id: "dog", title: "The Little Dog", emoji: "🐶",
        pages: [
            ["This is a little dog.", "The dog has a ball."],
            ["The dog can run.", "The dog can hop on a log."],
            ["The dog sees Sam.", "Sam has a cup."],
            ["Sam and the dog sit.", "The dog is happy."]
        ]
    },

    {
        id: "pig", title: "The Little Pig", emoji: "🐷",
        pages: [
            ["This is a little pig.", "The pig is on a farm."],
            ["The pig can run.", "The pig can nap in the mud."],
            ["The pig sees a red hat.", "The pig has the hat."],
            ["The hen sees the pig.", "The pig and the hen are happy."]
        ]
    },

    {
        id: "friend", title: "My Friend", emoji: "👧",
        pages: [
            ["I have a friend.", "My friend can read."],
            ["We read a book.", "We learn new words."],
            ["We go to school.", "We sit at a desk."],
            ["We help each other.", "We are happy."]
        ]
    },

    /* ----- NEW STORIES ----- */

    {
        id: "hen", title: "The Hen and the Fox", emoji: "🐔",
        pages: [
            ["This is a hen.", "The hen is on a box."],
            ["A fox sees the hen.", "The hen can run."],
            ["The hen hops on the log.", "The fox can not get the hen."],
            ["The hen is safe.", "The hen is happy."]
        ]
    },

    {
        id: "bus", title: "The Bus Ride", emoji: "🚌",
        pages: [
            ["Sam and Mia ride the bus.", "The bus is big and red."],
            ["The bus goes to school.", "Mia has a bag."],
            ["Sam has a map.", "They look at the map."],
            ["The bus stops at school.", "Sam and Mia are happy."]
        ]
    },

    {
        id: "fish", title: "The Big Fish", emoji: "🐟",
        pages: [
            ["This is a big fish.", "The fish is in a pond."],
            ["The fish can swim.", "It can swim up and down."],
            ["A little fish sees the big fish.", "They swim together."],
            ["The sun is hot.", "The fish are happy in the water."]
        ]
    },

    {
        id: "moon", title: "The Moon", emoji: "🌙",
        pages: [
            ["The sun is down.", "The moon is up."],
            ["The moon is big and bright.", "The stars are in the sky."],
            ["Sam looks at the moon.", "Sam is in his bed."],
            ["Sam has a nap.", "Good night, moon."]
        ]
    },

    {
        id: "rain", title: "A Rainy Day", emoji: "🌧️",
        pages: [
            ["It is a rainy day.", "The rain is wet."],
            ["Mia has an umbrella.", "The rain falls on it."],
            ["Mia and Sam run in the rain.", "They hop in the pond."],
            ["Then the sun comes out.", "Mia and Sam are happy."]
        ]
    }

];

let currentStory = null;
let currentStoryPage = 0;


function loadBooks() {

    const grid = document.getElementById("bookGrid");
    if (!grid) return;

    grid.innerHTML = "";

    stories.forEach(story => {

        const card = document.createElement("div");
        card.className = "book-card";

        card.innerHTML = `
            <div class="book-cover">${story.emoji}</div>
            <h2>${story.title}</h2>
            <p>Beginner reading story.</p>
            <button class="primary-btn">📖 Read Story</button>
        `;

        card.querySelector("button").onclick = () => openStory(story.id);

        grid.appendChild(card);
    });
}


function openStory(id) {

    currentStory = stories.find(story => story.id === id);
    if (!currentStory) return;

    currentStoryPage = 0;

    document.getElementById("storyModal").classList.add("show");
    document.getElementById("storyTitle").textContent = currentStory.title;
    document.getElementById("storyEmoji").textContent = currentStory.emoji;

    displayStoryPage();
}


function displayStoryPage() {

    if (!currentStory) return;

    const sentences = currentStory.pages[currentStoryPage];
    const storyText = document.getElementById("storyText");
    if (!storyText) return;

    storyText.innerHTML = sentences.map((sentence, index) => {

        const wordHtml = sentence.split(/\s+/).map(word => {

            const cleanWord = word.replace(/[^a-zA-Z]/g, "").toLowerCase();

            if (dictionary[cleanWord]) {
                return `<span class="story-word"
                              onclick="openDictionary('${cleanWord}')"
                              title="Click to learn this word">${word}</span>`;
            }

            return `<span class="story-normal-word">${word}</span>`;

        }).join(" ");

        return `<div class="story-sentence" data-s="${index}">${wordHtml}</div>`;

    }).join("");

    const percentage = ((currentStoryPage + 1) / currentStory.pages.length) * 100;
    const progress = document.getElementById("storyProgress");
    if (progress) progress.style.width = percentage + "%";

    const label = document.getElementById("storyPageLabel");
    if (label) {
        label.textContent =
            `Page ${currentStoryPage + 1} of ${currentStory.pages.length}`;
    }
}


window.nextStoryPage = function () {

    if (!currentStory) return;

    if (currentStoryPage < currentStory.pages.length - 1) {

        currentStoryPage++;
        displayStoryPage();
        readStoryAloud();

    } else {

        stopSpeaking();
        alert("🎉 Congratulations! You finished the story!");

        studentData.booksRead++;
        addProgress(3);

        saveToFirestore("story_completed", {
            story: currentStory.title,
            booksRead: studentData.booksRead
        });

        closeStory();
    }
};


window.previousStoryPage = function () {
    if (currentStoryPage > 0) {
        currentStoryPage--;
        displayStoryPage();
    }
};


/* Reads the page one sentence at a time and highlights it */
window.readStoryAloud = function () {

    if (!currentStory) return;

    const sentences = currentStory.pages[currentStoryPage];

    const highlight = (index) => {
        document.querySelectorAll(".story-sentence").forEach((el, i) => {
            el.classList.toggle("reading", i === index);
        });
    };

    speakQueue(
        sentences.map(s => ({ text: s, rate: 0.7, pause: 500 })),
        highlight
    );
};


window.closeStory = function () {
    const modal = document.getElementById("storyModal");
    if (modal) modal.classList.remove("show");
    stopSpeaking();
};


/* =====================================================
   ACTIVITY QUESTIONS
===================================================== */

const activityQuestions = {

    sound: [
        { question: "Which letter begins CAT? 🐱", options: ["A", "B", "C", "D"], answer: "C" },
        { question: "Which letter begins DOG? 🐶", options: ["B", "D", "F", "G"], answer: "D" },
        { question: "Which letter begins SUN? ☀️", options: ["S", "C", "P", "T"], answer: "S" },
        { question: "Which letter begins PIG? 🐷", options: ["B", "P", "D", "G"], answer: "P" },
        { question: "Which letter begins HAT? 🎩", options: ["H", "M", "T", "A"], answer: "H" },
        { question: "Which letter begins FISH? 🐟", options: ["P", "F", "S", "D"], answer: "F" },
        { question: "Which letter begins MAP? 🗺️", options: ["M", "N", "P", "B"], answer: "M" },
        { question: "Which letter begins CUP? 🥤", options: ["K", "C", "P", "T"], answer: "C" },
        { question: "Which letter begins FOX? 🦊", options: ["F", "X", "B", "S"], answer: "F" },
        { question: "Which letter begins BAT? 🦇", options: ["D", "B", "T", "C"], answer: "B" }
    ],

    matching: [
        { question: "Which word matches 🐶?", options: ["CAT", "DOG", "PIG", "SUN"], answer: "DOG" },
        { question: "Which word matches 🐱?", options: ["DOG", "CAT", "FOX", "PIG"], answer: "CAT" },
        { question: "Which word matches ☀️?", options: ["SUN", "CUP", "HAT", "BED"], answer: "SUN" },
        { question: "Which word matches 🐷?", options: ["PIG", "DOG", "FOX", "CAT"], answer: "PIG" },
        { question: "Which word matches 🦊?", options: ["HEN", "FOX", "DOG", "PIG"], answer: "FOX" },
        { question: "Which word matches 🎩?", options: ["HAT", "CAT", "BAT", "MAT"], answer: "HAT" },
        { question: "Which word matches 🥤?", options: ["CUP", "MAP", "PEN", "BUS"], answer: "CUP" },
        { question: "Which word matches 🚌?", options: ["BED", "BUS", "BAT", "BOX"], answer: "BUS" },
        { question: "Which word matches 🍎?", options: ["APPLE", "BALL", "DOG", "SUN"], answer: "APPLE" },
        { question: "Which word matches 🦁?", options: ["LION", "PIG", "CAT", "FOX"], answer: "LION" }
    ],

    scramble: [
        { question: "Unscramble: TAC", options: ["CAT", "ACT", "TAC", "COT"], answer: "CAT" },
        { question: "Unscramble: GOD", options: ["DOG", "GOD", "DIG", "DOT"], answer: "DOG" },
        { question: "Unscramble: GIP", options: ["PIG", "GIP", "BIG", "PEG"], answer: "PIG" },
        { question: "Unscramble: TAB", options: ["BAT", "TAB", "BET", "BIT"], answer: "BAT" },
        { question: "Unscramble: PAM", options: ["MAP", "MAT", "MOP", "PAM"], answer: "MAP" },
        { question: "Unscramble: TAH", options: ["HAT", "HIT", "HOT", "TAH"], answer: "HAT" },
        { question: "Unscramble: PUC", options: ["CUP", "PUP", "CAP", "PUC"], answer: "CUP" },
        { question: "Unscramble: NPE", options: ["PEN", "PAN", "PIN", "NPE"], answer: "PEN" },
        { question: "Unscramble: XOF", options: ["FOX", "FIX", "FOE", "XOF"], answer: "FOX" },
        { question: "Unscramble: NEH", options: ["HEN", "HIN", "HAT", "NEH"], answer: "HEN" }
    ],

    blank: [
        { question: "C _ T", options: ["A", "E", "I", "O"], answer: "A" },
        { question: "D _ G", options: ["A", "O", "I", "E"], answer: "O" },
        { question: "P _ G", options: ["A", "I", "O", "E"], answer: "I" },
        { question: "B _ T", options: ["A", "E", "I", "O"], answer: "A" },
        { question: "H _ T", options: ["A", "E", "I", "O"], answer: "A" },
        { question: "S _ N", options: ["A", "U", "I", "E"], answer: "U" },
        { question: "C _ P", options: ["A", "U", "I", "E"], answer: "U" },
        { question: "P _ N", options: ["A", "E", "I", "O"], answer: "E" },
        { question: "F _ X", options: ["A", "O", "I", "E"], answer: "O" },
        { question: "M _ P", options: ["A", "E", "I", "O"], answer: "A" }
    ],

    guess: [
        { question: "I am an animal. I say meow. What am I?", options: ["DOG", "CAT", "PIG", "FOX"], answer: "CAT" },
        { question: "I am yellow and bright. I am in the sky. What am I?", options: ["SUN", "DOG", "CUP", "HAT"], answer: "SUN" },
        { question: "I am an animal that says woof. What am I?", options: ["CAT", "DOG", "PIG", "FISH"], answer: "DOG" },
        { question: "I am a farm animal. I say oink. What am I?", options: ["PIG", "DOG", "CAT", "FOX"], answer: "PIG" },
        { question: "You wear me on your head. What am I?", options: ["CUP", "HAT", "BED", "BUS"], answer: "HAT" },
        { question: "You drink water from me. What am I?", options: ["CUP", "CAT", "MAP", "HAT"], answer: "CUP" },
        { question: "I have pages and you read me. What am I?", options: ["BALL", "BOOK", "DOG", "SUN"], answer: "BOOK" },
        { question: "I can swim in water. What am I?", options: ["FISH", "CAT", "DOG", "PIG"], answer: "FISH" },
        { question: "I am a large animal with a mane. What am I?", options: ["LION", "PIG", "CAT", "HEN"], answer: "LION" },
        { question: "I have black and white stripes. What am I?", options: ["ZEBRA", "DOG", "CAT", "PIG"], answer: "ZEBRA" }
    ]
};

let currentActivityType = null;
let currentActivityIndex = 0;

window.startActivityGame = function (type) {
    currentActivityType = type;
    currentActivityIndex = 0;
    showActivityQuestion();
};

function getActivityTitle(type) {
    return {
        sound: "🔤 Beginning Sounds",
        matching: "🧩 Word Matching",
        scramble: "🔀 Scrambled Words",
        blank: "✏️ Fill in the Blank",
        guess: "❓ Guessing Game"
    }[type];
}

function showActivityQuestion() {

    const area = document.getElementById("activityContainer");
    const questions = activityQuestions[currentActivityType];
    const question = questions[currentActivityIndex];

    area.innerHTML = `
        <div class="activity-box">
            <h2>${getActivityTitle(currentActivityType)}</h2>
            <p>Question ${currentActivityIndex + 1} of ${questions.length}</p>
            <div class="activity-question">${question.question}</div>
            <div>
                ${question.options.map(option => `
                    <button class="answer-btn"
                        onclick="answerActivity(this, '${option.replace(/'/g, "\\'")}')">
                        ${option}
                    </button>`).join("")}
            </div>
            <div id="activityFeedback"></div>
        </div>
    `;
}

window.answerActivity = function (button, answer) {

    const questions = activityQuestions[currentActivityType];
    const question = questions[currentActivityIndex];
    const feedback = document.getElementById("activityFeedback");

    document.querySelectorAll(".answer-btn")
        .forEach(btn => { btn.disabled = true; });

    if (answer === question.answer) {

        feedback.innerHTML = `
            <div class="feedback correct">
                🎉 Correct!<br><br>Great job! Keep going!<br>
                <button class="primary-btn" onclick="nextActivity()">Next Activity →</button>
            </div>`;

        speak("Correct! Great job!");
        addProgress(2);

    } else {

        feedback.innerHTML = `
            <div class="feedback incorrect">
                😊 Good try!<br><br>
                The correct answer is: <strong>${question.answer}</strong><br>
                <button class="primary-btn" onclick="nextActivity()">Next Activity →</button>
            </div>`;

        speak(`Good try. The correct answer is ${question.answer}.`);
    }
};

window.nextActivity = function () {

    const questions = activityQuestions[currentActivityType];
    currentActivityIndex++;

    if (currentActivityIndex >= questions.length) {

        document.getElementById("activityContainer").innerHTML = `
            <div class="activity-box">
                <h2>🎉 Activity Complete!</h2>
                <p>You finished all 10 questions.</p>
                <button class="primary-btn" onclick="showActivityMenu()">
                    Choose Another Activity
                </button>
            </div>`;
        return;
    }

    showActivityQuestion();
};

window.showActivityMenu = function () {
    document.getElementById("activityContainer").innerHTML = `
        <div class="activity-menu">
            <button onclick="startActivityGame('sound')">🔤 Beginning Sounds</button>
            <button onclick="startActivityGame('matching')">🧩 Word Matching</button>
            <button onclick="startActivityGame('scramble')">🔀 Scrambled Words</button>
            <button onclick="startActivityGame('blank')">✏️ Fill in the Blank</button>
            <button onclick="startActivityGame('guess')">❓ Guessing Game</button>
        </div>`;
};


/* =====================================================
   PRE-TEST / POST-TEST  -  SPEAKING ASSESSMENT
   20 items: 4 letters, 10 CVC words, 3 phrases, 3 sentences.
   Pre-test and post-test use the SAME 20 items so the
   scores can be compared fairly.
===================================================== */

const assessmentItems = [

    /* ----- 4 letter names ----- */
    { type: "letter", target: "B", display: "B",
      accept: ["b", "be", "bee", "bea"] },
    { type: "letter", target: "M", display: "M",
      accept: ["m", "em", "am"] },
    { type: "letter", target: "S", display: "S",
      accept: ["s", "es", "ess", "as"] },
    { type: "letter", target: "T", display: "T",
      accept: ["t", "tea", "tee", "ti"] },

    /* ----- 10 CVC words ----- */
    { type: "word", target: "cat", display: "CAT" },
    { type: "word", target: "sun", display: "SUN" },
    { type: "word", target: "dog", display: "DOG" },
    { type: "word", target: "pig", display: "PIG" },
    { type: "word", target: "hen", display: "HEN" },
    { type: "word", target: "bus", display: "BUS" },
    { type: "word", target: "map", display: "MAP" },
    { type: "word", target: "fox", display: "FOX" },
    { type: "word", target: "cup", display: "CUP" },
    { type: "word", target: "bed", display: "BED" },

    /* ----- 3 phrases ----- */
    { type: "phrase", target: "a red hat", display: "a red hat" },
    { type: "phrase", target: "the big dog", display: "the big dog" },
    { type: "phrase", target: "a little pig", display: "a little pig" },

    /* ----- 3 sentences ----- */
    { type: "sentence", target: "the cat can run", display: "The cat can run." },
    { type: "sentence", target: "sam sees the sun", display: "Sam sees the sun." },
    { type: "sentence", target: "we read a book", display: "We read a book." }
];

const assessmentTypeInfo = {
    letter:   { label: "🔤 Say the letter name",  say: "Say the name of this letter." },
    word:     { label: "🧩 Read the word",        say: "Read this word out loud." },
    phrase:   { label: "📖 Read the phrase",      say: "Read this phrase out loud." },
    sentence: { label: "📚 Read the sentence",    say: "Read this sentence out loud." }
};

const MAX_ATTEMPTS = 2;

let currentAssessment = null;
let assessmentIndex = 0;
let assessmentScore = 0;
let assessmentAttempts = 0;
let assessmentResults = [];
let assessmentLocked = false;     // true while an answer is being judged


/* ---------- Matching helpers ---------- */

function normalizeSpeech(text) {
    return String(text)
        .toLowerCase()
        .replace(/[^a-z\s']/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 },
        (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }
    return dp[a.length][b.length];
}

/* Is the heard word the same as the target word?
   Short words (3 letters) must match exactly (or be an alias);
   longer words allow a small tolerance. */
function wordsMatch(heard, target, accept = []) {
    if (heard === target) return true;
    if (accept.includes(heard)) return true;
    if (target.length >= 5) {
        const similarity = 1 - levenshtein(heard, target) / Math.max(heard.length, target.length);
        return similarity >= 0.8;
    }
    return false;
}

/* Returns true if ANY of the recognized alternatives is good enough */
function judgeSpeech(item, alternatives) {

    for (const alt of alternatives) {

        const heard = normalizeSpeech(alt);
        if (!heard) continue;

        const heardWords = heard.split(" ");

        if (item.type === "letter" || item.type === "word") {

            const accept = item.accept || [];
            if (heardWords.some(w => wordsMatch(w, item.target, accept))) {
                return true;
            }

        } else {

            // phrase / sentence: at least 80% of target words heard
            const targetWords = item.target.split(" ");
            const found = targetWords.filter(t =>
                heardWords.some(h => wordsMatch(h, t))
            ).length;

            if (found / targetWords.length >= 0.8) return true;
        }
    }

    return false;
}


/* ---------- Assessment menu ---------- */

function refreshAssessmentMenu() {

    const menu = document.getElementById("assessmentMenu");
    if (!menu) return;

    const preDone = studentData.preTest !== null;
    const total = assessmentItems.length;

    const preCard = preDone
        ? `
        <div class="assessment-card">
            <h2>📋 Pre-Test</h2>
            <p class="done-note">✓ Completed: ${studentData.preTest}/${total}</p>
        </div>`
        : `
        <div class="assessment-card">
            <h2>📋 Pre-Test</h2>
            <p>Take this FIRST, before using the learning materials.
               Read ${total} items aloud.</p>
            <button class="primary-btn" onclick="startAssessment('pre')">
                🎤 Start Pre-Test
            </button>
        </div>`;

    const postCard = preDone
        ? `
        <div class="assessment-card">
            <h2>🎯 Post-Test</h2>
            <p>Take this after completing the learning materials.
               ${studentData.postTest !== null
                    ? `<br><strong>Last score: ${studentData.postTest}/${total}</strong>` : ""}</p>
            <button class="primary-btn" onclick="startAssessment('post')">
                🎤 ${studentData.postTest !== null ? "Retake" : "Start"} Post-Test
            </button>
        </div>`
        : `
        <div class="assessment-card locked">
            <h2>🎯 Post-Test</h2>
            <p>🔒 Locked. Finish the Pre-Test first.</p>
        </div>`;

    menu.innerHTML = preCard + postCard;
    menu.style.display = "";
}


window.startAssessment = function (type) {

    if (type === "post" && studentData.preTest === null) {
        alert("Please take the Pre-Test first.");
        return;
    }

    if (type === "pre" && studentData.preTest !== null) return;

    currentAssessment = type;
    assessmentIndex = 0;
    assessmentScore = 0;
    assessmentAttempts = 0;
    assessmentResults = [];
    assessmentLocked = false;

    document.getElementById("assessmentMenu").style.display = "none";

    showAssessmentQuestion();
};


function showAssessmentQuestion() {

    const area = document.getElementById("assessmentArea");
    const item = assessmentItems[assessmentIndex];
    const info = assessmentTypeInfo[item.type];

    assessmentAttempts = 0;
    assessmentLocked = false;

    const targetClass = (item.type === "phrase" || item.type === "sentence")
        ? "assess-target small" : "assess-target";

    area.innerHTML = `
        <div class="activity-box">

            <p>${currentAssessment === "pre" ? "Pre-Test" : "Post-Test"} ·
               Question ${assessmentIndex + 1} of ${assessmentItems.length}</p>

            <span class="assess-type">${info.label}</span>

            <div class="${targetClass}">${item.display}</div>

            <div class="assess-controls">
                <button class="instruction-btn" onclick="speakAssessmentInstruction()">
                    🔊 Listen to Instructions
                </button>

                <button id="micBtn" class="mic-btn" onclick="startListening()">
                    🎤 Tap and Speak
                </button>
            </div>

            <div id="assessStatus" class="assess-status">
                Tap the microphone, then read it out loud.
            </div>

            <div id="assessActions" class="assess-actions">
                <button class="skip-btn" onclick="skipAssessmentItem()">Skip this question</button>
            </div>

        </div>
    `;
}

window.speakAssessmentInstruction = function () {
    const item = assessmentItems[assessmentIndex];
    speak(assessmentTypeInfo[item.type].say +
          " Tap the microphone button, then speak clearly.");
};

function setStatus(message, mood) {
    const el = document.getElementById("assessStatus");
    if (!el) return;
    el.className = "assess-status" + (mood ? " " + mood : "");
    el.innerHTML = message;
}

function setMicState(listening) {
    const mic = document.getElementById("micBtn");
    if (!mic) return;
    mic.classList.toggle("listening", listening);
    mic.disabled = false;
    mic.innerHTML = listening ? "🔴 Listening..." : "🎤 Tap and Speak";
}

function showNextButton(isLast) {
    const actions = document.getElementById("assessActions");
    if (!actions) return;
    actions.innerHTML = `
        <button class="primary-btn" onclick="nextAssessmentItem()">
            ${isLast ? "Finish ✔" : "Next →"}
        </button>`;
    const mic = document.getElementById("micBtn");
    if (mic) mic.disabled = true;
}

window.startListening = function () {

    if (assessmentLocked) return;

    if (!SpeechRecognitionAPI) {
        setStatus(
            "😕 This browser does not support the microphone feature. " +
            "Please open ReadStart in Google Chrome or Microsoft Edge.",
            "bad"
        );
        return;
    }

    stopSpeaking();   // do not let the speaker be heard by the mic

    const item = assessmentItems[assessmentIndex];

    setMicState(true);
    setStatus("🎧 Listening... speak now.");

    listenOnce(

        (alternatives) => {

            setMicState(false);

            const correct = judgeSpeech(item, alternatives);
            const heard = alternatives[0] || "";

            assessmentAttempts++;

            if (correct) {
                finishItem(true, heard);
            } else if (assessmentAttempts >= MAX_ATTEMPTS) {
                finishItem(false, heard);
            } else {
                setStatus(
                    `I heard: <strong>"${escapeHtml(heard)}"</strong><br>` +
                    "Let's try one more time. Tap the microphone.",
                    "bad"
                );
            }
        },

        (errorCode) => {

            setMicState(false);

            const messages = {
                "no-speech":
                    "I did not hear anything. Tap the microphone and try again.",
                "not-allowed":
                    "The microphone is blocked. Please allow microphone access " +
                    "in your browser, then tap the microphone again.",
                "service-not-allowed":
                    "The microphone is blocked. Please allow microphone access.",
                "audio-capture":
                    "No microphone was found. Please connect a microphone.",
                "network":
                    "Speech recognition needs an internet connection. " +
                    "Please check your connection and try again.",
                "aborted": ""
            };

            const message = messages[errorCode];
            if (message !== "") {
                setStatus("😕 " + (message ||
                    "Something went wrong. Please try again."), "bad");
            }
        }
    );
};

function finishItem(correct, heard) {

    assessmentLocked = true;

    const item = assessmentItems[assessmentIndex];

    if (correct) assessmentScore++;

    assessmentResults.push({
        item: item.display,
        type: item.type,
        heard: heard,
        correct: correct,
        attempts: assessmentAttempts
    });

    if (correct) {
        setStatus("✅ Great reading!", "good");
        speak("Great reading!");
    } else {
        setStatus(
            `I heard: <strong>"${escapeHtml(heard || "nothing")}"</strong><br>` +
            "Good try! Let's go to the next one.",
            "bad"
        );
    }

    showNextButton(assessmentIndex === assessmentItems.length - 1);
}

window.skipAssessmentItem = function () {

    if (assessmentLocked) return;

    stopListeningNow();
    setMicState(false);

    assessmentLocked = true;

    const item = assessmentItems[assessmentIndex];

    assessmentResults.push({
        item: item.display,
        type: item.type,
        heard: "(skipped)",
        correct: false,
        attempts: assessmentAttempts
    });

    nextAssessmentItem();
};

window.nextAssessmentItem = function () {

    stopSpeaking();
    stopListeningNow();

    assessmentIndex++;

    if (assessmentIndex < assessmentItems.length) {
        showAssessmentQuestion();
    } else {
        finishAssessment();
    }
};


function finishAssessment() {

    const score = assessmentScore;
    const total = assessmentItems.length;

    if (currentAssessment === "pre") {
        studentData.preTest = score;
        studentData.preDetails = assessmentResults;
    } else {
        studentData.postTest = score;
        studentData.postDetails = assessmentResults;
    }

    updateBadges();
    saveStudentData();

    saveToFirestore(
        currentAssessment === "pre" ? "pre_test" : "post_test",
        { score: score, total: total, details: assessmentResults }
    );

    const rows = assessmentResults.map(r => `
        <div class="result-row ${r.correct ? "ok" : "bad"}">
            <span>${r.correct ? "✅" : "❌"} ${escapeHtml(r.item)}</span>
            <span>${escapeHtml(r.heard)}</span>
        </div>`).join("");

    const nextLabel = currentAssessment === "pre"
        ? "Start Learning →" : "View My Progress";

    document.getElementById("assessmentArea").innerHTML = `
        <div class="activity-box">
            <h2>🎉 Assessment Complete!</h2>
            <h1>${score}/${total}</h1>
            <p>Your score has been saved.</p>

            <div class="result-list">${rows}</div>

            <button class="primary-btn" onclick="closeAssessment()">${nextLabel}</button>
        </div>
    `;

    speak(`Assessment complete. You scored ${score} out of ${total}.`);

    updateProgress();
}

window.closeAssessment = function () {

    stopSpeaking();

    document.getElementById("assessmentArea").innerHTML = "";
    refreshAssessmentMenu();

    showPage(currentAssessment === "pre" ? "dashboard" : "progress");
};


/* =====================================================
   PROGRESS
===================================================== */

function addProgress(points) {

    studentData.activities++;
    studentData.stars += points;

    updateBadges();
    saveStudentData();
    updateDashboard();
    updateProgress();

    saveToFirestore("activity_progress", {
        activities: studentData.activities,
        stars: studentData.stars
    });
}


/* =====================================================
   BADGES
===================================================== */

function updateBadges() {

    const badges = [];

    if (studentData.activities >= 1) badges.push("first");
    if (studentData.activities >= 5) badges.push("reader");
    if (studentData.booksRead >= 1) badges.push("book");

    if (studentData.postTest !== null &&
        studentData.postTest >= PASSING_CHAMPION_SCORE) {
        badges.push("champion");
    }

    studentData.badges = badges;
}


function updateDashboard() {

    const values = {
        dashboardStars: studentData.stars,
        dashboardBooks: studentData.booksRead,
        dashboardActivities: studentData.activities,
        dashboardBadges: studentData.badges.length
    };

    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });
}


function updateProgress() {

    const total = assessmentItems.length;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText("progressStars", studentData.stars);
    setText("progressActivities", studentData.activities);

    const percentage = Math.min((studentData.activities / 20) * 100, 100);

    const fill = document.getElementById("progressFill");
    if (fill) fill.style.width = percentage + "%";

    setText("progressPercent", Math.round(percentage) + "%");

    setText("studentPreScore",
        studentData.preTest === null ? "Not taken" : `${studentData.preTest}/${total}`);

    setText("studentPostScore",
        studentData.postTest === null ? "Not taken" : `${studentData.postTest}/${total}`);

    if (studentData.preTest !== null && studentData.postTest !== null) {
        const difference = studentData.postTest - studentData.preTest;
        setText("studentImprovement", `${difference >= 0 ? "+" : ""}${difference}`);
    } else {
        setText("studentImprovement", "--");
    }

    loadBadges();
}


function loadBadges() {

    const grid = document.getElementById("badgeGrid");
    if (!grid) return;

    const badges = [
        { id: "first",    icon: "🌱", title: "First Step",       description: "Complete your first activity." },
        { id: "reader",   icon: "📚", title: "Active Reader",    description: "Complete five activities." },
        { id: "book",     icon: "📖", title: "Story Reader",     description: "Read a digital story." },
        { id: "champion", icon: "🏆", title: "Reading Champion",
          description: `Score ${PASSING_CHAMPION_SCORE} or higher in the post-test.` }
    ];

    grid.innerHTML = badges.map(badge => {

        const unlocked = studentData.badges.includes(badge.id);

        return `
            <div class="badge ${unlocked ? "unlocked" : ""}">
                <div class="badge-icon">${badge.icon}</div>
                <h3>${badge.title}</h3>
                <p>${badge.description}</p>
                <small>${unlocked ? "✓ Unlocked" : "🔒 Locked"}</small>
            </div>`;

    }).join("");
}


/* =====================================================
   INITIALIZATION
===================================================== */

loadAlphabet();
loadWords();
loadBooks();
updateBadges();
updateDashboard();
updateProgress();
refreshAssessmentMenu();

const dictionaryResults = document.getElementById("dictionaryResults");

if (dictionaryResults) {
    dictionaryResults.innerHTML = `
        <div class="dictionary-card">
            <h2>📖 ReadStart Dictionary</h2>
            <p class="meaning">Search for a word to see its meaning and example sentence.</p>
            <p class="example">You can also click highlighted words inside the digital stories.</p>
        </div>`;
}