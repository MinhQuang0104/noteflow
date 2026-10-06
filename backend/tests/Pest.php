<?php

use Tests\TestCase;

uses(TestCase::class)
    ->beforeEach(function () {
        TestCase::assertSafeTestDatabase();
    })
    ->in('Feature', 'Contract');
