<?php

$finder = PhpCsFixer\Finder::create()->in(__DIR__);

$config = new PhpCsFixer\Config();

$finder = $config->getFinder()
    ->ignoreDotFiles(false)
    ->in(__DIR__)
    ->name(__FILE__);

$config->setRules([
    'no_trailing_whitespace' => true,
    'whitespace_after_comma_in_array' => true,
]);

return $config;