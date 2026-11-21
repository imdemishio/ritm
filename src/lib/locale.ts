const ru = {
  language: 'ru',
  region: 'ru-RU',
  navigation: {
    home: { title: 'Главная', description: '' },
    habits: { title: 'Привычки', description: 'Управляйте целями, расписанием и порядком.' },
    stats: { title: 'Статистика', description: 'Следите за прогрессом и сравнивайте периоды.' },
    friends: { title: 'Друзья', description: 'Поддерживайте друг друга и делитесь достижениями.' },
    challenges: { title: 'Челленджи', description: 'Выберите цель и пройдите путь до конца.' },
    awards: { title: 'Достижения', description: 'Награды за регулярность и новые рекорды.' },
    settings: { title: 'Настройки', description: 'Настройте оформление, профиль и уведомления.' },
  },
  account: {
    login: 'Вход в аккаунт',
    register: 'Создать аккаунт',
    recover: 'Восстановление пароля',
    reset: 'Новый пароль',
  },
} as const;

export const locale = ru;
