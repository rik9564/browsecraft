Feature: AI Step Interpretation Test
  As a Browsecraft developer
  I want to verify that runtime AI steps can interpret undefined Gherkin steps
  So that users can write plain English steps without manual step definitions

  Scenario: AI interprets login steps on SauceDemo
    Given I open the browser to "https://www.saucedemo.com"
    When I enter "standard_user" in the username field
    And I enter "secret_sauce" in the password field
    And I press the login button
    Then the page should display "Products"
    And I should be on the inventory page
