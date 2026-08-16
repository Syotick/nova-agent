// Vue 2.7 + pinia 类型补充
declare module '*.vue' {
  import Vue from 'vue'
  export default Vue
}

import type { useMainStore } from './store'
type MainStore = ReturnType<typeof useMainStore>

declare module 'vue/types/vue' {
  interface Vue {
    $store: MainStore
  }
}
