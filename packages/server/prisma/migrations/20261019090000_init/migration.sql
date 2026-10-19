-- 初始结构。CHECK 约束不交给 ORM 生成，直接写在迁移里：
-- 超卖与负计数在数据库层也被挡住，而不是只靠应用代码。

CREATE TABLE `users` (
    `id`         VARCHAR(36)  NOT NULL,
    `name`       VARCHAR(64)  NOT NULL,
    `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `events` (
    `id`               VARCHAR(36)  NOT NULL,
    `title`            VARCHAR(120) NOT NULL,
    `capacity`         INTEGER      NOT NULL,
    `confirmed_count`  INTEGER      NOT NULL DEFAULT 0,
    `waitlist_count`   INTEGER      NOT NULL DEFAULT 0,
    `signup_deadline`  DATETIME(3)  NOT NULL,
    `start_at`         DATETIME(3)  NOT NULL,
    `end_at`           DATETIME(3)  NOT NULL,
    `cancelled_at`     DATETIME(3)  NULL,
    `cancel_reason`    VARCHAR(255) NULL,
    `organizer_id`     VARCHAR(36)  NOT NULL,
    `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    INDEX `events_start_at_idx` (`start_at`),
    CONSTRAINT `events_organizer_id_fkey` FOREIGN KEY (`organizer_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `chk_events_capacity` CHECK (`capacity` > 0),
    CONSTRAINT `chk_events_counts` CHECK (`confirmed_count` >= 0 AND `confirmed_count` <= `capacity` AND `waitlist_count` >= 0),
    CONSTRAINT `chk_events_time_order` CHECK (`signup_deadline` <= `start_at` AND `start_at` < `end_at`),
    CONSTRAINT `chk_events_cancel_reason` CHECK ((`cancelled_at` IS NULL AND `cancel_reason` IS NULL) OR (`cancelled_at` IS NOT NULL))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `signups` (
    `id`           VARCHAR(36)  NOT NULL,
    `event_id`     VARCHAR(36)  NOT NULL,
    `user_id`      VARCHAR(36)  NOT NULL,
    `status`       ENUM('CONFIRMED', 'WAITLISTED', 'CANCELLED') NOT NULL DEFAULT 'CONFIRMED',
    `waitlist_seq` INTEGER      NULL,
    `created_at`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    UNIQUE INDEX `signups_event_id_user_id_key` (`event_id`, `user_id`),
    UNIQUE INDEX `signups_event_id_waitlist_seq_key` (`event_id`, `waitlist_seq`),
    INDEX `signups_event_id_status_waitlist_seq_idx` (`event_id`, `status`, `waitlist_seq`),
    CONSTRAINT `signups_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `signups_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `chk_signups_waitlist_seq` CHECK (
        (`status` = 'WAITLISTED' AND `waitlist_seq` IS NOT NULL AND `waitlist_seq` > 0)
        OR (`status` <> 'WAITLISTED' AND `waitlist_seq` IS NULL)
    )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
