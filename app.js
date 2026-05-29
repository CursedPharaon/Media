// ========== 1. ПОДКЛЮЧЕНИЕ К SUPABASE ==========
// ЗАМЕНИТЕ ЭТИ ДАННЫЕ НА СВОИ ИЗ НАСТРОЕК SUPABASE!
const SUPABASE_URL = 'https://XXXXXXXXXXXXXX.supabase.co'      // Ваш URL
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....' // Ваш anon ключ

// Инициализация Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

// Глобальные переменные
let currentUser = null

// ========== 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function showMessage(elementId, text, isError = true) {
    const el = document.getElementById(elementId)
    if (el) {
        el.textContent = text
        el.style.color = isError ? '#e53e3e' : '#38a169'
        setTimeout(() => { el.textContent = '' }, 3000)
    }
}

// ========== 3. АВТОРИЗАЦИЯ ==========
async function register() {
    const email = document.getElementById('email').value
    const password = document.getElementById('password').value

    if (!email || !password) {
        showMessage('authMessage', 'Заполните email и пароль')
        return
    }

    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
        showMessage('authMessage', error.message)
    } else {
        showMessage('authMessage', '✅ Регистрация успешна! Теперь войдите.', false)
    }
}

async function login() {
    const email = document.getElementById('email').value
    const password = document.getElementById('password').value

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
        showMessage('authMessage', error.message)
    } else {
        showMessage('authMessage', '✅ Вход выполнен!', false)
        await loadUserAndApp()
    }
}

async function logout() {
    await supabase.auth.signOut()
    currentUser = null
    document.getElementById('authBlock').style.display = 'block'
    document.getElementById('appBlock').classList.add('hidden')
    document.getElementById('header').style.display = 'none'
}

async function loadUserAndApp() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
        currentUser = user
        document.getElementById('authBlock').style.display = 'none'
        document.getElementById('appBlock').classList.remove('hidden')
        document.getElementById('header').style.display = 'flex'
        document.getElementById('userEmail').textContent = user.email
        await loadPosts()
        subscribeToChanges()
    }
}

// ========== 4. РАБОТА С ПОСТАМИ ==========
async function createPost() {
    if (!currentUser) return

    const title = document.getElementById('postTitle').value.trim()
    if (!title) {
        alert('Напишите текст поста')
        return
    }

    const { error } = await supabase
        .from('posts')
        .insert([{ 
            title: title, 
            upvotes: 0, 
            downvotes: 0, 
            user_id: currentUser.id 
        }])

    if (error) {
        alert('Ошибка: ' + error.message)
    } else {
        document.getElementById('postTitle').value = ''
        await loadPosts()
    }
}

async function loadPosts() {
    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        console.error(error)
        return
    }

    const container = document.getElementById('postsList')
    container.innerHTML = ''

    for (const post of posts) {
        // Загружаем комментарии к посту
        const { data: comments } = await supabase
            .from('comments')
            .select('*')
            .eq('post_id', post.id)
            .order('created_at', { ascending: true })

        container.appendChild(renderPost(post, comments || []))
    }
}

function renderPost(post, comments) {
    const div = document.createElement('div')
    div.className = 'card'
    div.id = `post-${post.id}`

    const score = post.upvotes - post.downvotes

    div.innerHTML = `
        <div class="post-title">${escapeHtml(post.title)}</div>
        <div class="votes">
            <button class="vote-btn up" data-id="${post.id}" data-type="up">👍 ${post.upvotes}</button>
            <span class="score">⭐ ${score}</span>
            <button class="vote-btn down" data-id="${post.id}" data-type="down">👎 ${post.downvotes}</button>
        </div>
        <hr>
        <div style="margin-top: 10px;">
            <strong>💬 Комментарии (${comments.length})</strong>
            <div id="comments-${post.id}">
                ${comments.map(c => `<div class="comment"><strong>${escapeHtml(c.user_id?.slice(0,8))}:</strong> ${escapeHtml(c.content)}</div>`).join('')}
            </div>
            <div class="comment-form">
                <input type="text" id="comment-input-${post.id}" placeholder="Написать комментарий...">
                <button class="add-comment" data-id="${post.id}">Отправить</button>
            </div>
        </div>
    `

    // Вешаем обработчики
    const upBtn = div.querySelector('.vote-btn.up')
    const downBtn = div.querySelector('.vote-btn.down')
    const commentBtn = div.querySelector('.add-comment')

    upBtn.addEventListener('click', () => vote(post.id, 'up'))
    downBtn.addEventListener('click', () => vote(post.id, 'down'))
    commentBtn.addEventListener('click', () => addComment(post.id))

    return div
}

async function vote(postId, type) {
    if (!currentUser) return

    // Сначала получаем текущий пост
    const { data: post } = await supabase
        .from('posts')
        .select('upvotes, downvotes')
        .eq('id', postId)
        .single()

    if (!post) return

    const updates = {
        upvotes: type === 'up' ? post.upvotes + 1 : post.upvotes,
        downvotes: type === 'down' ? post.downvotes + 1 : post.downvotes
    }

    await supabase
        .from('posts')
        .update(updates)
        .eq('id', postId)

    await loadPosts() // перезагружаем ленту
}

async function addComment(postId) {
    if (!currentUser) return

    const input = document.getElementById(`comment-input-${postId}`)
    const content = input.value.trim()

    if (!content) return

    const { error } = await supabase
        .from('comments')
        .insert([{
            post_id: postId,
            content: content,
            user_id: currentUser.id
        }])

    if (!error) {
        input.value = ''
        await loadPosts() // обновляем
    } else {
        alert('Ошибка: ' + error.message)
    }
}

// Подписка на изменения в реальном времени
function subscribeToChanges() {
    supabase
        .channel('public:posts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => loadPosts())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => loadPosts())
        .subscribe()
}

// Защита от XSS
function escapeHtml(str) {
    if (!str) return ''
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;'
        if (m === '<') return '&lt;'
        if (m === '>') return '&gt;'
        return m
    })
}

// ========== 5. ЗАПУСК ==========
document.addEventListener('DOMContentLoaded', () => {
    // Проверяем, есть ли уже сессия
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
            loadUserAndApp()
        }
    })

    // Вешаем обработчики кнопок
    document.getElementById('loginBtn').addEventListener('click', login)
    document.getElementById('registerBtn').addEventListener('click', register)
    document.getElementById('logoutBtn').addEventListener('click', logout)
    document.getElementById('createPostBtn').addEventListener('click', createPost)
})
