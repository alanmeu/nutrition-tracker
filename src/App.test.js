import { render, screen } from "@testing-library/react";
import App from "./App";

jest.mock("./utils/supabase", () => ({
  hasSupabaseConfig: false
}));

test("renders setup screen when supabase env is missing", () => {
  render(<App />);
  expect(screen.getByText(/configuration supabase requise/i)).toBeInTheDocument();
});
