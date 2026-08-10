import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import Root from './Root.vue'
import App from './App.vue'
import NotePopout from './components/NotePopout.vue'
import './assets/styles/variables.css'
import './assets/styles/global.css'

const routes = [
  { path: '/', component: App },
  { path: '/note/:id', component: NotePopout, props: route => ({ noteId: route.params.id }) }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

const app = createApp(Root)
app.use(createPinia())
app.use(router)
app.mount('#app')
