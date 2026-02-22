@saucelabs
Feature: Sauce Labs Demo App (Swag Labs)
  As a QA engineer
  I want to verify the Swag Labs e-commerce app
  So that I can demonstrate Browsecraft's BDD capabilities

  Background:
    Given I am on the Swag Labs login page

  @smoke @login
  Scenario: Successful login with standard user
    When I fill "Username" with "standard_user"
    And I fill "Password" with "secret_sauce"
    And I click "Login"
    Then I should be on the inventory page
    And I should see "Products"

  @login @negative
  Scenario: Login fails with invalid credentials
    When I fill "Username" with "invalid_user"
    And I fill "Password" with "wrong_password"
    And I click "Login"
    Then I should see an error message containing "Username and password do not match"

  @login @negative
  Scenario: Login fails for locked out user
    When I fill "Username" with "locked_out_user"
    And I fill "Password" with "secret_sauce"
    And I click "Login"
    Then I should see an error message containing "Sorry, this user has been locked out"

  @smoke @cart
  Scenario: Add item to cart and verify badge
    When I login as "standard_user"
    And I click "Add to cart" on the first product
    Then the cart badge should show "1"

  @cart
  Scenario: Add multiple items and remove one
    When I login as "standard_user"
    And I click "Add to cart" on the first product
    And I click "Add to cart" on the second product
    Then the cart badge should show "2"
    When I click "Remove" on the first product
    Then the cart badge should show "1"

  @smoke @checkout
  Scenario: Complete checkout flow
    When I login as "standard_user"
    And I click "Add to cart" on the first product
    And I go to the cart
    And I click "Checkout"
    And I fill "First Name" with "John"
    And I fill "Last Name" with "Doe"
    And I fill "Zip/Postal Code" with "12345"
    And I click "Continue"
    Then I should be on the checkout overview page
    When I click "Finish"
    Then I should see "Thank you for your order!"

  @smoke @navigation
  Scenario: Navigate to cart and back
    When I login as "standard_user"
    And I go to the cart
    Then I should be on the cart page
    When I click "Continue Shopping"
    Then I should be on the inventory page

  @login
  Scenario Outline: Login with different users
    When I fill "Username" with "<username>"
    And I fill "Password" with "secret_sauce"
    And I click "Login"
    Then I should be on the inventory page

    Examples:
      | username                |
      | standard_user           |
      | performance_glitch_user |
