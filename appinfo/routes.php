<?php
/**
 * SPDX-FileCopyrightText: 2026 uttii-com <https://uttii.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
declare(strict_types=1);

return [
    'routes' => [
        ['name' => 'shortcut#create', 'url' => '/api/create', 'verb' => 'POST'],
        ['name' => 'shortcut#create_batch', 'url' => '/api/create-batch', 'verb' => 'POST'],
        ['name' => 'shortcut#resolve_file', 'url' => '/api/resolve-file', 'verb' => 'GET'],
        ['name' => 'shortcut#resolve', 'url' => '/api/resolve', 'verb' => 'GET'],
        ['name' => 'shortcut#delete_shortcut', 'url' => '/api/delete', 'verb' => 'POST'],
        ['name' => 'settings#setLanguage', 'url' => '/api/settings/language', 'verb' => 'POST'],
    ],
];
