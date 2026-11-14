<?php
/**
 * SPDX-FileCopyrightText: 2026 uttii-com <https://uttii.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
declare(strict_types=1);

namespace OCA\Shortcut\Listener;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\Shortcut\AppInfo\Application;
use OCP\App\IAppManager;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\IConfig;
use OCP\IUserSession;
use OCP\Util;

class LoadAdditionalScriptsListener implements IEventListener {
    public function __construct(
        private IAppManager $appManager,
        private IConfig $config,
        private IUserSession $userSession,
        private IInitialState $initialStateService,
    ) {}

    public function handle(Event $event): void {
        if (!($event instanceof LoadAdditionalScriptsEvent)) {
            return;
        }

        if (!$this->appManager->isEnabledForUser(Application::APP_ID)) {
            return;
        }

        $user = $this->userSession->getUser();
        $lang = $user ? $this->config->getUserValue($user->getUID(), Application::APP_ID, 'lang', 'ja') : 'ja';
        if ($lang !== 'en' && $lang !== 'ja') {
            $lang = 'ja';
        }

        $this->initialStateService->provideInitialState('lang', $lang);
        Util::addStyle(Application::APP_ID, 'style');
        Util::addScript(Application::APP_ID, 'main');
    }
}
