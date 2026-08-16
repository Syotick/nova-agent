import Vue from 'vue'
import { createPinia, PiniaVuePlugin, setActivePinia } from 'pinia'
import App from './App.vue'
import './styles.css'

Vue.use(PiniaVuePlugin)
const pinia = createPinia()
setActivePinia(pinia)

new Vue({
  pinia,
  render: (h) => h(App),
}).$mount('#app')
