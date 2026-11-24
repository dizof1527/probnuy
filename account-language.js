(function () {
  'use strict';

  const languages = ['ru', 'en', 'fr', 'es', 'pt'];
  const languageNames = ['Русский', 'English', 'Français', 'Español', 'Português'];
  const translations = {
    privateTimetables: ["Личное расписание","Personal timetable","Emploi du temps personnel","Horario personal","Horário pessoal"],
    personalTimetable: ["Моё расписание преподавателя","My teaching timetable","Mon emploi du temps d’enseignant","Mi horario docente","O meu horário docente"],
    signupProgress: ["Шаги регистрации","Registration steps","Étapes de l’inscription","Pasos del registro","Etapas do registo"],
    signupIdentity: ["Данные аккаунта","Account details","Informations du compte","Datos de la cuenta","Dados da conta"],
    signupStudy: ["Учёба и профиль","Studies and profile","Études et profil","Estudios y perfil","Estudos e perfil"],
    requiredField: ["Заполните это поле.","Fill in this field.","Renseignez ce champ.","Rellena este campo.","Preenche este campo."],
    invalidEmail: ["Введите действительный адрес почты.","Enter a valid email address.","Saisissez une adresse e-mail valide.","Introduce una dirección de correo válida.","Introduz um endereço de e-mail válido."],
    minimumLength: ["Введите не менее {n} символов.","Enter at least {n} characters.","Saisissez au moins {n} caractères.","Introduce al menos {n} caracteres.","Introduz pelo menos {n} caracteres."],
    adminLoading: ["Загрузка пользователей…","Loading users…","Chargement des utilisateurs…","Cargando usuarios…","A carregar os utilizadores…"],
    adminEmpty: ["Пользователи не найдены.","No users found.","Aucun utilisateur trouvé.","No se encontraron usuarios.","Não foram encontrados utilizadores."],
    adminError: ["Не удалось загрузить пользователей.","Could not load users.","Impossible de charger les utilisateurs.","No se pudieron cargar los usuarios.","Não foi possível carregar os utilizadores."],
    noEmail: ["Почта не указана","No email address","Adresse e-mail absente","Sin correo electrónico","Sem endereço de e-mail"],
    pendingEmail: ["ожидает подтверждения почты","awaiting email confirmation","en attente de confirmation de l’adresse","pendiente de confirmar el correo","a aguardar confirmação do e-mail"],
    visitStats: ["Сегодня — {today}, всего — {total}","Today: {today}, total: {total}","Aujourd’hui : {today}, total : {total}","Hoy: {today}, total: {total}","Hoje: {today}, total: {total}"],
    showAvatar: ["Показать аватар","Show avatar","Afficher l’avatar","Mostrar imagen","Mostrar imagem"],
    memberAvatar: ["Аватар пользователя","User’s avatar","Avatar de l’utilisateur","Imagen del usuario","Imagem do utilizador"],
    memberAvatarError: ["Не удалось открыть аватар.","Could not open the avatar.","Impossible d’afficher l’avatar.","No se pudo abrir la imagen.","Não foi possível abrir a imagem."],
    promote: ["Назначить преподавателем","Make teacher","Attribuer le rôle d’enseignant","Asignar rol de docente","Atribuir a função de docente"],
    demote: ["Вернуть роль ученика","Restore student role","Rétablir le rôle d’étudiant","Restaurar el rol de estudiante","Restaurar a função de estudante"],
    roleChanged: ["Роль изменена.","Role updated.","Rôle modifié.","Rol actualizado.","Função atualizada."],
    roleChangeError: ["Не удалось изменить роль. Обновите список и проверьте права.","Could not change the role. Refresh the list and check your permissions.","Impossible de modifier le rôle. Actualisez la liste et vérifiez vos droits.","No se pudo cambiar el rol. Actualiza la lista y comprueba tus permisos.","Não foi possível alterar a função. Atualiza a lista e verifica as permissões."],
    block: ["Заблокировать","Suspend","Suspendre","Suspender","Suspender"],
    unblock: ["Разблокировать","Unsuspend","Rétablir l’accès","Restaurar acceso","Restaurar acesso"],
    confirmBan: ["Заблокировать доступ пользователя к расписанию?","Suspend this user’s access to the timetable?","Suspendre l’accès de cet utilisateur à l’emploi du temps ?","¿Suspender el acceso de este usuario al horario?","Suspender o acesso deste utilizador ao horário?"],
    memberBlocked: ["Пользователь заблокирован.","User suspended.","Utilisateur suspendu.","Usuario suspendido.","Utilizador suspenso."],
    memberUnblocked: ["Пользователь разблокирован.","User’s access restored.","Accès rétabli.","Acceso restaurado.","Acesso restaurado."],
    accessChangeError: ["Не удалось изменить доступ пользователя.","Could not change the user’s access.","Impossible de modifier l’accès de l’utilisateur.","No se pudo cambiar el acceso del usuario.","Não foi possível alterar o acesso do utilizador."],
    brand: ["Расписание БашГАУ","Bashkir SAU timetable","Emploi du temps de la Bashkir SAU","Horario de la Bashkir SAU","Horário da Bashkir SAU"],
    chooseLanguage: ["Выберите язык","Choose your language","Choisissez votre langue","Elige tu idioma","Escolhe o teu idioma"],
    account: ["Аккаунт","Account","Compte","Cuenta","Conta"],
    login: ["Вход","Sign in","Connexion","Iniciar sesión","Iniciar sessão"],
    signup: ["Регистрация","Register","Inscription","Registro","Registo"],
    loginTitle: ["Вход в расписание","Sign in to the timetable","Accéder à l’emploi du temps","Accede al horario","Acede ao horário"],
    signupTitle: ["Создайте аккаунт","Create an account","Créer un compte","Crea tu cuenta","Cria a tua conta"],
    resetTitle: ["Восстановление доступа","Recover your account","Récupérer votre compte","Recupera tu cuenta","Recupera a tua conta"],
    updateTitle: ["Новый пароль","New password","Nouveau mot de passe","Nueva contraseña","Nova palavra-passe"],
    loginIntro: ["Войдите, чтобы открыть расписание.","Sign in to view the timetable.","Connectez-vous pour consulter l’emploi du temps.","Inicia sesión para consultar el horario.","Inicia sessão para consultar o horário."],
    signupIntro: ["Заполните анкету, чтобы сразу открыть расписание своей группы.","Complete the form to open your group’s timetable.","Remplissez le formulaire pour accéder à l’emploi du temps de votre groupe.","Completa el formulario para abrir el horario de tu grupo.","Preenche o formulário para consultar o horário do teu grupo."],
    resetIntro: ["Укажите почту, которую использовали при регистрации.","Enter the email address you used to register.","Saisissez l’adresse utilisée lors de l’inscription.","Indica el correo que usaste al registrarte.","Indica o e-mail que usaste no registo."],
    updateIntro: ["Придумайте пароль для следующего входа.","Choose the password you’ll use to sign in next time.","Choisissez le mot de passe pour votre prochaine connexion.","Elige la contraseña para tu próximo inicio de sesión.","Escolhe a palavra-passe para o próximo início de sessão."],
    email: ["Электронная почта","Email address","Adresse e-mail","Correo electrónico","E-mail"],
    password: ["Пароль","Password","Mot de passe","Contraseña","Palavra-passe"],
    passwordHint: ["Не менее 8 символов.","At least 8 characters.","Au moins 8 caractères.","Al menos 8 caracteres.","Pelo menos 8 caracteres."],
    loginSubmit: ["Войти","Sign in","Se connecter","Entrar","Entrar"],
    signupSubmit: ["Зарегистрироваться","Create account","S’inscrire","Crear cuenta","Criar conta"],
    resetSubmit: ["Отправить ссылку","Send link","Envoyer le lien","Enviar enlace","Enviar ligação"],
    updateSubmit: ["Сохранить пароль","Save password","Enregistrer le mot de passe","Guardar contraseña","Guardar palavra-passe"],
    forgot: ["Забыли пароль?","Forgot your password?","Mot de passe oublié ?","¿Olvidaste tu contraseña?","Esqueceste-te da palavra-passe?"],
    backToLogin: ["Вернуться ко входу","Back to sign in","Revenir à la connexion","Volver al inicio de sesión","Voltar ao início de sessão"],
    profileFields: ["Анкета","Profile details","Informations du profil","Datos del perfil","Dados do perfil"],
    nameHint: ["Введите фамилию, имя и отчество, если оно есть, по-русски, кириллицей.","Enter your last name, first name and patronymic, if applicable, in Russian using Cyrillic.","Saisissez votre nom, votre prénom et votre patronyme, si vous en avez un, en russe et en alphabet cyrillique.","Escribe tus apellidos, nombre y patronímico, si lo tienes, en ruso y con alfabeto cirílico.","Escreve o apelido, o nome e o patronímico, se aplicável, em russo e em alfabeto cirílico."],
    lastName: ["Фамилия","Last name","Nom de famille","Apellidos","Apelido"],
    firstName: ["Имя","First name","Prénom","Nombre","Nome"],
    patronymic: ["Отчество, если есть","Patronymic, if applicable","Patronyme, si applicable","Patronímico, si lo tienes","Patronímico, se aplicável"],
    course: ["Курс","Year of study","Année d’études","Año de estudios","Ano de estudos"],
    courseOption: ["{n} курс","Year {n}","Année {n}","Año {n}","{n}.º ano"],
    group: ["Группа","Group","Groupe","Grupo","Grupo"],
    subgroup: ["Подгруппа","Subgroup","Sous-groupe","Subgrupo","Subgrupo"],
    chooseCourse: ["Выберите курс","Choose your year","Choisissez votre année","Elige el año","Escolhe o ano"],
    chooseGroup: ["Выберите группу","Choose your group","Choisissez votre groupe","Elige el grupo","Escolhe o grupo"],
    courseFirst: ["Сначала выберите курс","Choose your year first","Choisissez d’abord votre année","Elige primero el año","Escolhe primeiro o ano"],
    chooseSubgroup: ["Выберите подгруппу","Choose your subgroup","Choisissez votre sous-groupe","Elige el subgrupo","Escolhe o subgrupo"],
    groupFirst: ["Сначала выберите группу","Choose your group first","Choisissez d’abord votre groupe","Elige primero el grupo","Escolhe primeiro o grupo"],
    noSubgroup: ["Без подгруппы","No subgroup","Sans sous-groupe","Sin subgrupo","Sem subgrupo"],
    subgroupOption: ["Подгруппа {n}","Subgroup {n}","Sous-groupe {n}","Subgrupo {n}","Subgrupo {n}"],
    fullTime: ["Очная","Full-time","À temps plein","Presencial","Presencial"],
    partTime: ["Очно-заочная","Part-time","À temps partiel","Semipresencial","Semipresencial"],
    distance: ["Заочная","Distance learning","À distance","A distancia","À distância"],
    nickname: ["Псевдоним для топа, по желанию","Leaderboard nickname, optional","Pseudonyme pour le classement, facultatif","Alias para la clasificación, opcional","Alcunha para a classificação, opcional"],
    nicknameHint: ["Если поле пустое, сайт подставит нейтральный псевдоним.","If you leave this blank, the site will assign a neutral nickname.","Si vous laissez ce champ vide, le site vous attribuera un pseudonyme neutre.","Si dejas el campo vacío, el sitio te asignará un alias neutro.","Se deixares o campo vazio, o site atribui-te uma alcunha neutra."],
    rulesTitle: ["Правила профиля","Profile rules","Règles du profil","Normas del perfil","Regras do perfil"],
    profileRules: ["Выбирайте уместный псевдоним и аватар. За ненормативную лексику, оскорбления или непристойные изображения администрация может запросить объяснение и заблокировать аккаунт.","Choose an appropriate nickname and avatar. For profanity, insults or obscene images, administrators may ask you to explain and suspend your account.","Choisissez un pseudonyme et un avatar appropriés. En cas de vulgarité, d’insultes ou d’image obscène, l’administration pourra vous demander des explications et suspendre votre compte.","Elige un alias y una imagen de perfil adecuados. Si usas lenguaje vulgar, insultos o imágenes obscenas, la administración puede pedirte explicaciones y suspender tu cuenta.","Escolhe uma alcunha e uma imagem de perfil adequadas. Em caso de linguagem imprópria, insultos ou imagens obscenas, a administração pode pedir explicações e suspender a tua conta."],
    avatarRules: ["Используйте уместное изображение. За оскорбительный или непристойный аватар администрация может запросить объяснение и заблокировать аккаунт.","Use an appropriate image. For an offensive or obscene avatar, administrators may ask you to explain and suspend your account.","Utilisez une image appropriée. En cas d’avatar offensant ou obscène, l’administration pourra vous demander des explications et suspendre votre compte.","Usa una imagen adecuada. Si el avatar es ofensivo u obsceno, la administración puede pedirte explicaciones y suspender tu cuenta.","Usa uma imagem adequada. Se o avatar for ofensivo ou obsceno, a administração pode pedir explicações e suspender a tua conta."],
    signOut: ["Выйти","Sign out","Se déconnecter","Cerrar sesión","Terminar sessão"],
    settings: ["Настройки профиля","Profile settings","Paramètres du profil","Ajustes del perfil","Definições do perfil"],
    saveProfile: ["Сохранить профиль","Save profile","Enregistrer le profil","Guardar perfil","Guardar perfil"],
    avatar: ["Аватар","Avatar","Avatar","Imagen de perfil","Imagem de perfil"],
    ownAvatar: ["Ваш аватар","Your avatar","Votre avatar","Tu imagen de perfil","A tua imagem de perfil"],
    avatarFile: ["Выберите изображение","Choose an image","Choisissez une image","Elige una imagen","Escolhe uma imagem"],
    uploadAvatar: ["Загрузить аватар","Upload avatar","Importer l’avatar","Subir imagen","Carregar imagem"],
    removeAvatar: ["Убрать аватар","Remove avatar","Retirer l’avatar","Quitar imagen","Remover imagem"],
    adminPanel: ["Управление пользователями","Manage users","Gestion des utilisateurs","Gestionar usuarios","Gerir utilizadores"],
    editSchedule: ["Редактировать пару в расписании","Edit a class in the timetable","Modifier un cours dans l’emploi du temps","Editar una clase del horario","Editar uma aula no horário"],
    editHint: ["Откройте нужную пару и нажмите «Редактировать пару».","Open the class and select “Edit class”.","Ouvrez le cours et sélectionnez l’option de modification.","Abre la clase y selecciona la opción de editar.","Abre a aula e seleciona a opção de editar."],
    search: ["Поиск по имени, почте или группе","Search by name, email or group","Chercher par nom, e-mail ou groupe","Buscar por nombre, correo o grupo","Pesquisar por nome, e-mail ou grupo"],
    searchSubmit: ["Найти","Search","Chercher","Buscar","Pesquisar"],
    previous: ["Назад","Previous","Précédent","Anterior","Anterior"],
    next: ["Далее","Next","Suivant","Siguiente","Seguinte"],
    topTitle: ["Топ-5 по посещениям","Top five by visits","Top 5 des visites","Top 5 por visitas","Top 5 por visitas"],
    student: ["Ученик","Student","Étudiant","Estudiante","Estudante"],
    teacher: ["Преподаватель","Teacher","Enseignant","Docente","Docente"],
    admin: ["Администратор","Administrator","Administrateur","Administrador","Administrador"],
    banned: ["заблокирован","suspended","suspendu","suspendido","suspenso"],
    roleChecking: ["Проверяем роль…","Checking permissions…","Vérification des droits…","Comprobando permisos…","A verificar as permissões…"],
    roleUnknown: ["Роль недоступна","Role unavailable","Rôle indisponible","Rol no disponible","Função indisponível"],
    roleError: ["Не удалось проверить права аккаунта. Попробуйте обновить страницу.","Could not check your permissions. Try refreshing the page.","Impossible de vérifier vos droits. Actualisez la page.","No se pudieron comprobar tus permisos. Actualiza la página.","Não foi possível verificar as permissões. Atualiza a página."],
    banNotice: ["Доступ к расписанию заблокирован администратором.","An administrator has suspended your access to the timetable.","L’administration a suspendu votre accès à l’emploi du temps.","La administración ha suspendido tu acceso al horario.","A administração suspendeu o teu acesso ao horário."],
    yourNickname: ["Ваш псевдоним в топе — {nick}","Leaderboard nickname: {nick}","Votre pseudonyme dans le classement : {nick}","Tu alias en la clasificación: {nick}","A tua alcunha na classificação: {nick}"],
    profileRequired: ["Заполните профиль, чтобы открыть расписание.","Complete your profile to open the timetable.","Complétez votre profil pour accéder à l’emploi du temps.","Completa tu perfil para consultar el horario.","Preenche o teu perfil para consultar o horário."],
    profileSaved: ["Профиль сохранён.","Profile saved.","Profil enregistré.","Perfil guardado.","Perfil guardado."],
    catalogError: ["Не удалось загрузить список групп.","Could not load the list of groups.","Impossible de charger la liste des groupes.","No se pudo cargar la lista de grupos.","Não foi possível carregar a lista de grupos."],
    noVisits: ["Посещений пока нет.","No visits yet.","Aucune visite pour le moment.","Aún no hay visitas.","Ainda não há visitas."],
    topError: ["Не удалось загрузить топ.","Could not load the leaderboard.","Impossible de charger le classement.","No se pudo cargar la clasificación.","Não foi possível carregar a classificação."],
    avatarLoadError: ["Не удалось загрузить аватар.","Could not load your avatar.","Impossible de charger votre avatar.","No se pudo cargar tu imagen.","Não foi possível carregar a tua imagem."],
    avatarFileError: ["Выберите изображение JPEG, PNG или WebP до 8 МБ.","Choose a JPEG, PNG or WebP image up to 8 MB.","Choisissez une image JPEG, PNG ou WebP de 8 Mo maximum.","Elige una imagen JPEG, PNG o WebP de hasta 8 MB.","Escolhe uma imagem JPEG, PNG ou WebP até 8 MB."],
    avatarDecodeError: ["Не удалось открыть изображение.","Could not open the image.","Impossible d’ouvrir l’image.","No se pudo abrir la imagen.","Não foi possível abrir a imagem."],
    avatarRemoved: ["Аватар удалён.","Avatar removed.","Avatar retiré.","Imagen eliminada.","Imagem removida."],
    avatarSaved: ["Аватар сохранён.","Avatar saved.","Avatar enregistré.","Imagen guardada.","Imagem guardada."],
    avatarSaveError: ["Не удалось сохранить аватар.","Could not save the avatar.","Impossible d’enregistrer l’avatar.","No se pudo guardar la imagen.","Não foi possível guardar a imagem."],
    noCloud: ["Для входа откройте сайт расписания через интернет.","Open the timetable website online to sign in.","Ouvrez le site en ligne pour vous connecter.","Abre el sitio web con conexión a internet para entrar.","Abre o site com ligação à internet para iniciar sessão."],
    signOutError: ["Не удалось выйти из аккаунта. Попробуйте снова.","Could not sign out. Please try again.","Impossible de vous déconnecter. Réessayez.","No se pudo cerrar la sesión. Inténtalo de nuevo.","Não foi possível terminar a sessão. Tenta novamente."],
    linkExpired: ["Ссылка устарела или недействительна. Запросите новую.","This link expired or is invalid. Request a new one.","Ce lien a expiré ou n’est pas valide. Demandez-en un nouveau.","El enlace ha caducado o no es válido. Solicita uno nuevo.","A ligação expirou ou é inválida. Pede uma nova."],
    confirmFallback: ["Для этого аккаунта Supabase запросил подтверждение почты. Проверьте входящие письма.","Supabase requested email confirmation for this account. Check your inbox.","Supabase demande de confirmer l’adresse de ce compte. Consultez votre boîte de réception.","Supabase solicitó confirmar el correo de esta cuenta. Revisa tu bandeja de entrada.","O Supabase pediu a confirmação do e-mail desta conta. Consulta a caixa de entrada."],
    recoverySent: ["Если аккаунт существует, на почту придёт ссылка для смены пароля.","If an account exists, you’ll receive a password reset link.","Si le compte existe, vous recevrez un lien de réinitialisation.","Si la cuenta existe, recibirás un enlace para cambiar la contraseña.","Se a conta existir, receberás uma ligação para redefinir a palavra-passe."],
    passwordSaved: ["Пароль обновлён.","Password updated.","Mot de passe mis à jour.","Contraseña actualizada.","Palavra-passe atualizada."],
    invalidCredentials: ["Проверьте почту и пароль.","Check your email address and password.","Vérifiez votre adresse e-mail et votre mot de passe.","Comprueba el correo y la contraseña.","Verifica o e-mail e a palavra-passe."],
    emailNotConfirmed: ["Этот аккаунт ожидает подтверждения почты. Проверьте письмо или обратитесь к администратору.","This account is awaiting email confirmation. Check your inbox or contact an administrator.","Ce compte attend la confirmation de son adresse. Consultez votre boîte de réception ou contactez l’administration.","Esta cuenta tiene pendiente la confirmación del correo. Revisa tu bandeja de entrada o contacta con la administración.","Esta conta aguarda confirmação do e-mail. Consulta a caixa de entrada ou contacta a administração."],
    signupDisabled: ["Регистрация сейчас отключена.","Registration is currently disabled.","Les inscriptions sont actuellement fermées.","El registro está desactivado.","O registo está desativado."],
    emailLimit: ["Лимит писем исчерпан. Попробуйте позже.","The email limit has been reached. Try again later.","La limite d’envoi d’e-mails est atteinte. Réessayez plus tard.","Se alcanzó el límite de correos. Inténtalo más tarde.","O limite de e-mails foi atingido. Tenta mais tarde."],
    weakPassword: ["Выберите более надёжный пароль.","Choose a stronger password.","Choisissez un mot de passe plus robuste.","Elige una contraseña más segura.","Escolhe uma palavra-passe mais segura."],
    samePassword: ["Укажите пароль, который отличается от предыдущего.","Choose a password different from your current one.","Choisissez un mot de passe différent du précédent.","Elige una contraseña distinta de la anterior.","Escolhe uma palavra-passe diferente da anterior."],
    profileValidation: ["Заполните имя, фамилию, группу и подгруппу.","Enter your name and select a group and subgroup.","Saisissez votre nom et votre prénom, puis choisissez votre groupe et votre sous-groupe.","Escribe tu nombre y apellidos y selecciona un grupo y subgrupo.","Indica o teu nome e apelido e seleciona um grupo e subgrupo."],
    groupValidation: ["Проверьте группу и подгруппу.","Check your group and subgroup.","Vérifiez votre groupe et votre sous-groupe.","Comprueba el grupo y el subgrupo.","Verifica o grupo e o subgrupo."],
    nicknameTaken: ["Этот псевдоним уже занят.","This nickname is already taken.","Ce pseudonyme est déjà utilisé.","Este alias ya está en uso.","Esta alcunha já está a ser usada."],
    emailTaken: ["Аккаунт с этой почтой уже существует. Войдите или восстановите пароль.","An account already uses this email. Sign in or reset your password.","Un compte utilise déjà cette adresse. Connectez-vous ou réinitialisez votre mot de passe.","Ya existe una cuenta con este correo. Inicia sesión o restablece la contraseña.","Já existe uma conta com este e-mail. Inicia sessão ou redefine a palavra-passe."],
    authError: ["Действие не выполнено. Проверьте соединение и попробуйте снова.","The request failed. Check your connection and try again.","L’action a échoué. Vérifiez votre connexion et réessayez.","La operación falló. Comprueba tu conexión e inténtalo de nuevo.","A operação falhou. Verifica a ligação e tenta novamente."],
  };

  const supported = code => languages.includes(code);
  let selected = '';
  try {
    const saved = localStorage.getItem('bgau_account_lang');
    const timetable = localStorage.getItem('bashgau_lang_v1');
    if (supported(saved)) selected = supported(timetable) ? timetable : saved;
  } catch { /* The language can still be selected for this page. */ }

  let language = selected || 'ru';
  function t(key, values = {}) {
    return (translations[key]?.[languages.indexOf(language)] || translations[key]?.[0] || key)
      .replace(/\{(\w+)\}/g, (token, name) => values[name] ?? token);
  }

  function apply(code) {
    if (!supported(code)) return;
    selected = language = code;
    try {
      localStorage.setItem('bgau_account_lang', code);
      localStorage.setItem('bashgau_lang_v1', code);
    } catch { /* The selection still works for this page. */ }
    updatePage();
  }

  function updatePage() {
    document.documentElement.lang = language;
    document.title = t('account') + ' · ' + t('brand');
    document.querySelectorAll('[data-i18n]').forEach(element => element.textContent = t(element.dataset.i18n));
    document.querySelectorAll('[data-i18n-alt]').forEach(element => element.alt = t(element.dataset.i18nAlt));
    document.querySelectorAll('[data-i18n-aria]').forEach(element => element.setAttribute('aria-label', t(element.dataset.i18nAria)));
    document.getElementById('languageTranslation').hidden = language === 'en';
    const toggle = document.getElementById('changeLanguage');
    toggle.textContent = languageNames[languages.indexOf(language)];
    toggle.setAttribute('aria-label', t('chooseLanguage'));
  }

  window.bgauAccountLanguage = { t, apply, updatePage, get selected() { return selected; } };
})();
